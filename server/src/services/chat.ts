import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { emitToUsers, getPresence } from '../io.js';
import { isBlocked, listBlockedIds } from './blocks.js';
import { contactNameMap, isContact, nameFor } from './contacts.js';
import { pushNewMessage } from './push.js';
import { isStickerId, stickerUrl, USER_STICKER_PREFIX, userStickerUrl } from './stickers.js';

/** Remove o arquivo de um anexo do disco (se houver). Nunca derruba a exclusão da mensagem. */
async function deleteAttachmentFile(url: string | null) {
  if (!url) return;
  const diskName = url.split('/').pop();
  if (!diskName) return;
  await unlink(join(config.uploadDir, diskName)).catch(() => {});
}

export const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isBusiness: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

export const messageInclude = {
  receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
  replyTo: { select: { id: true, senderId: true, body: true, deletedAt: true, attachmentType: true, attachmentUrl: true, attachmentName: true, attachmentMime: true } },
  stars: { select: { userId: true } },
} satisfies Prisma.MessageInclude;

type MessageFull = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export type MessageStatus = 'sent' | 'delivered' | 'read';

type ReceiptTimes = { deliveredAt: Date | null; readAt: Date | null };

/** Status de uma mensagem enviada: só é "lida"/"entregue" quando todos os destinatários chegaram lá. */
export function statusOf(receipts: ReceiptTimes[]): MessageStatus {
  // Sem destinatário (conversa com você mesmo): você é quem lê, então já aparece como lida (✓✓ azul), como no WhatsApp.
  if (receipts.length === 0) return 'read';
  if (receipts.every((r) => r.readAt)) return 'read';
  if (receipts.every((r) => r.deliveredAt)) return 'delivered';
  return 'sent';
}

function buildAttachment(m: MessageFull) {
  switch (m.attachmentType) {
    case 'IMAGE':
    case 'VIDEO':
    case 'AUDIO':
    case 'FILE':
      if (!m.attachmentUrl) return null;
      return {
        type: m.attachmentType,
        url: m.attachmentUrl,
        mime: m.attachmentMime,
        name: m.attachmentName,
        size: m.attachmentSize,
      };
    case 'LOCATION':
      if (m.latitude === null || m.longitude === null) return null;
      return {
        type: m.attachmentType,
        latitude: m.latitude,
        longitude: m.longitude,
        liveUntil: m.liveUntil?.toISOString() ?? null,
      };
    case 'STICKER':
      if (!m.attachmentUrl) return null;
      return { type: m.attachmentType, url: m.attachmentUrl, name: m.attachmentName };
    case 'CONTACT':
      if (!m.contactUserId) return null;
      return {
        type: m.attachmentType,
        contactUserId: m.contactUserId,
        contactName: m.contactName,
        contactUsername: m.contactUsername,
      };
    default:
      return null;
  }
}

export function serializeMessage(m: MessageFull, viewerId: string) {
  const deleted = m.deletedAt !== null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    body: deleted ? '' : m.body,
    deleted,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    attachment: deleted ? null : buildAttachment(m),
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          senderId: m.replyTo.senderId,
          deleted: m.replyTo.deletedAt !== null,
          body: m.replyTo.deletedAt ? '' : m.replyTo.body.slice(0, 200),
          // Miniatura/ícone no card de resposta (foto, vídeo, áudio, figurinha...).
          attachment:
            m.replyTo.deletedAt || !m.replyTo.attachmentType
              ? null
              : { type: m.replyTo.attachmentType, url: m.replyTo.attachmentUrl ?? undefined, name: m.replyTo.attachmentName ?? undefined, mime: m.replyTo.attachmentMime ?? undefined },
        }
      : null,
    // Só quem enviou vê o status de entrega/leitura.
    status: m.senderId === viewerId ? statusOf(m.receipts) : null,
    forwarded: m.forwarded,
    starred: m.stars.some((s) => s.userId === viewerId),
  };
}

export type SerializedMessage = ReturnType<typeof serializeMessage>;

// ---------------------------------------------------------------------------
// Participação
// ---------------------------------------------------------------------------

export async function getMemberIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.participant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function assertMember(conversationId: string, userId: string) {
  const row = await prisma.participant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { role: true, clearedAt: true },
  });
  if (!row) throw new HttpError(404, 'Conversa não encontrada');
  return row;
}

/** Todos os usuários que compartilham alguma conversa comigo (para avisar presença). */
export async function getContactIds(userId: string): Promise<string[]> {
  const rows = await prisma.participant.findMany({
    where: {
      userId: { not: userId },
      conversation: { participants: { some: { userId } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

async function loadMessage(id: string) {
  return prisma.message.findUnique({ where: { id }, include: messageInclude });
}

/** Emite a mensagem para todos os membros, serializada do ponto de vista de cada um. */
async function broadcastMessage(
  event: string,
  messageId: string,
  memberIds: string[],
  // Id temporário criado pelo app de quem enviou: devolvido só a ele, para trocar a bolha "enviando" pela real.
  sender?: { id: string; clientId?: string },
) {
  const message = await loadMessage(messageId);
  if (!message) return null;
  for (const memberId of memberIds) {
    const payload = serializeMessage(message, memberId);
    const echo = sender && sender.clientId && sender.id === memberId ? { clientId: sender.clientId } : {};
    emitToUsers([memberId], event, { ...payload, ...echo });
  }
  return message;
}

export type MediaAttachmentInput = {
  kind: 'media';
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  url: string;
  mime: string;
  name: string;
  size: number;
};
export type LocationAttachmentInput = {
  kind: 'location';
  latitude: number;
  longitude: number;
  liveUntil?: Date | null;
};
export type ContactAttachmentInput = { kind: 'contact'; contactUserId: string };
export type StickerAttachmentInput = { kind: 'sticker'; id: string };
export type AttachmentInput = MediaAttachmentInput | LocationAttachmentInput | ContactAttachmentInput | StickerAttachmentInput;

type AttachmentFields = Partial<
  Pick<
    Prisma.MessageUncheckedCreateInput,
    | 'attachmentType'
    | 'attachmentUrl'
    | 'attachmentName'
    | 'attachmentMime'
    | 'attachmentSize'
    | 'latitude'
    | 'longitude'
    | 'liveUntil'
    | 'contactUserId'
    | 'contactName'
    | 'contactUsername'
  >
>;

async function attachmentData(attachment: AttachmentInput | null | undefined, senderId: string): Promise<AttachmentFields> {
  if (!attachment) return {};
  if (attachment.kind === 'media') {
    return {
      attachmentType: attachment.type,
      attachmentUrl: attachment.url,
      attachmentName: attachment.name,
      attachmentMime: attachment.mime,
      attachmentSize: attachment.size,
    };
  }
  if (attachment.kind === 'sticker') {
    if (attachment.id.startsWith(USER_STICKER_PREFIX)) {
      const url = await userStickerUrl(senderId, attachment.id.slice(USER_STICKER_PREFIX.length));
      return {
        attachmentType: 'STICKER',
        attachmentUrl: url,
        attachmentName: attachment.id,
        attachmentMime: url.endsWith('.svg') ? 'image/svg+xml' : url.endsWith('.png') ? 'image/png' : 'image/webp',
      };
    }
    if (!isStickerId(attachment.id)) throw new HttpError(400, 'Figurinha desconhecida');
    return {
      attachmentType: 'STICKER',
      attachmentUrl: stickerUrl(attachment.id),
      attachmentName: attachment.id,
      attachmentMime: 'image/svg+xml',
    };
  }
  if (attachment.kind === 'location') {
    return {
      attachmentType: 'LOCATION',
      latitude: attachment.latitude,
      longitude: attachment.longitude,
      liveUntil: attachment.liveUntil ?? null,
    };
  }
  if (!(await isContact(senderId, attachment.contactUserId))) {
    throw new HttpError(403, 'Você só pode compartilhar alguém que esteja nos seus contatos');
  }
  const contact = await prisma.user.findUnique({ where: { id: attachment.contactUserId }, select: userSelect });
  if (!contact) throw new HttpError(404, 'Contato não encontrado');
  return {
    attachmentType: 'CONTACT',
    contactUserId: contact.id,
    contactName: contact.displayName,
    contactUsername: contact.username,
  };
}

// O app reenvia quando a rede oscila: o mesmo clientId devolve a mesma mensagem em vez de duplicar.
const recentSends = new Map<string, { at: number; result: Promise<Awaited<ReturnType<typeof sendMessageOnce>>> }>();
export function sendMessage(input: Parameters<typeof sendMessageOnce>[0]) {
  if (!input.clientId) return sendMessageOnce(input);
  const key = `${input.senderId}:${input.clientId}`;
  const now = Date.now();
  for (const [k, v] of recentSends) if (now - v.at > 10 * 60_000) recentSends.delete(k);
  const hit = recentSends.get(key);
  if (hit) return hit.result;
  const result = sendMessageOnce(input);
  recentSends.set(key, { at: now, result });
  result.catch(() => recentSends.delete(key));
  return result;
}

async function sendMessageOnce(input: {
  conversationId: string;
  senderId: string;
  body: string;
  replyToId?: string | null;
  clientId?: string;
  attachment?: AttachmentInput | null;
  forwarded?: boolean;
}) {
  const memberIds = await getMemberIds(input.conversationId);
  if (!memberIds.includes(input.senderId)) throw new HttpError(404, 'Conversa não encontrada');

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { type: true, disappearSeconds: true },
  });
  if (conversation?.type === 'DIRECT') {
    const other = memberIds.find((id) => id !== input.senderId);
    if (other && (await isBlocked(other, input.senderId))) {
      throw new HttpError(403, 'Você foi bloqueado por esta pessoa');
    }
  }

  let replyToId: string | null = null;
  if (input.replyToId) {
    const target = await prisma.message.findFirst({
      where: { id: input.replyToId, conversationId: input.conversationId },
      select: { id: true },
    });
    replyToId = target?.id ?? null;
  }

  const recipients = memberIds.filter((id) => id !== input.senderId);
  const attachmentFields = await attachmentData(input.attachment, input.senderId);

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: input.body,
        replyToId,
        forwarded: !!input.forwarded,
        ...attachmentFields,
        expiresAt: conversation?.disappearSeconds ? new Date(Date.now() + conversation.disappearSeconds * 1000) : null,
        receipts: {
          create: recipients.map((userId) => ({ userId, conversationId: input.conversationId })),
        },
      },
      select: { id: true, createdAt: true },
    });
    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    // Mensagem nova: a conversa reaparece para quem tinha arquivado ou apagado.
    await tx.participant.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: { in: memberIds },
        OR: [{ archivedAt: { not: null } }, { hiddenAt: { not: null } }],
      },
      data: { archivedAt: null, hiddenAt: null },
    });
    return message;
  });

  // Quem já está online recebe na hora: marca como entregue antes de emitir.
  const online = await getPresence().onlineAmong(recipients);
  if (online.length > 0) {
    await prisma.messageReceipt.updateMany({
      where: { messageId: created.id, userId: { in: online } },
      data: { deliveredAt: new Date() },
    });
  }

  const message = await broadcastMessage('message:new', created.id, memberIds, {
    id: input.senderId,
    clientId: input.clientId,
  });
  if (!message) throw new HttpError(500, 'Falha ao enviar mensagem');
  // Notificação nativa (iPhone) em segundo plano: não atrasa a resposta para quem enviou.
  void pushNewMessage(created.id).catch((err) => console.error('Falha ao notificar:', err));
  return serializeMessage(message, input.senderId);
}

// ---------------------------------------------------------------------------
// Localização em tempo real
// ---------------------------------------------------------------------------

async function loadLiveLocation(userId: string, messageId: string) {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true, conversationId: true, deletedAt: true, attachmentType: true, liveUntil: true },
  });
  if (
    !existing ||
    existing.senderId !== userId ||
    existing.deletedAt ||
    existing.attachmentType !== 'LOCATION' ||
    !existing.liveUntil ||
    existing.liveUntil.getTime() <= Date.now()
  ) {
    throw new HttpError(404, 'Compartilhamento de localização não encontrado ou já encerrado');
  }
  return existing;
}

export async function updateLiveLocation(userId: string, messageId: string, latitude: number, longitude: number) {
  const existing = await loadLiveLocation(userId, messageId);
  await prisma.message.update({ where: { id: messageId }, data: { latitude, longitude } });
  const memberIds = await getMemberIds(existing.conversationId);
  await broadcastMessage('message:updated', messageId, memberIds);
}

export async function stopLiveLocation(userId: string, messageId: string) {
  const existing = await loadLiveLocation(userId, messageId);
  await prisma.message.update({ where: { id: messageId }, data: { liveUntil: new Date() } });
  const memberIds = await getMemberIds(existing.conversationId);
  await broadcastMessage('message:updated', messageId, memberIds);
}

export async function editMessage(userId: string, messageId: string, body: string) {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true, conversationId: true, deletedAt: true },
  });
  if (!existing || existing.senderId !== userId || existing.deletedAt) {
    throw new HttpError(404, 'Mensagem não encontrada');
  }
  await prisma.message.update({ where: { id: messageId }, data: { body, editedAt: new Date() } });
  const memberIds = await getMemberIds(existing.conversationId);
  const message = await broadcastMessage('message:updated', messageId, memberIds);
  return message ? serializeMessage(message, userId) : null;
}

/** Número master (MASTER_PHONE): apaga qualquer mensagem para todos, sem prazo. */
export async function isMaster(userId: string) {
  if (!config.masterPhone) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  return user?.phone === config.masterPhone;
}

/** Mensagem de uma conversa da qual a pessoa participa (senão, "não encontrada"). */
async function memberMessage(userId: string, messageId: string) {
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, conversationId: true, createdAt: true, deletedAt: true, attachmentUrl: true, body: true, attachmentType: true },
  });
  if (!m) throw new HttpError(404, 'Mensagem não encontrada');
  await assertMember(m.conversationId, userId);
  return m;
}

/** "Apagar para mim": some só para esta pessoa (a conversa dos outros não muda). */
export async function hideMessage(userId: string, messageId: string) {
  const m = await memberMessage(userId, messageId);
  await prisma.messageHidden.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId },
    update: {},
  });
  emitToUsers([userId], 'message:removed', { conversationId: m.conversationId, messageId });
}

/**
 * "Apagar para todos": quem enviou, até DELETE_FOR_ALL_MINUTES depois do envio. O master apaga qualquer
 * mensagem das conversas em que está, a qualquer hora. Depois do prazo sobra só "Apagar para mim".
 */
export async function deleteMessage(userId: string, messageId: string) {
  const existing = await memberMessage(userId, messageId);
  const master = await isMaster(userId);
  if (!master) {
    if (existing.senderId !== userId) throw new HttpError(403, 'Você só pode apagar para todos as suas mensagens');
    if (Date.now() - existing.createdAt.getTime() > config.deleteForAllMinutes * 60_000) {
      throw new HttpError(403, 'O prazo para apagar para todos acabou. Use "Apagar para mim".');
    }
  }
  if (!existing.deletedAt) {
    // Apaga para todos: o texto e o anexo somem do banco e do disco, não só ficam escondidos.
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: '', attachmentUrl: null, attachmentName: null, attachmentMime: null, attachmentSize: null },
    });
    await deleteAttachmentFile(existing.attachmentUrl);
    // Estava fixada: sai do topo da conversa.
    const unpinned = await prisma.conversation.updateMany({
      where: { id: existing.conversationId, pinnedMessageId: messageId },
      data: { pinnedMessageId: null, pinnedPreview: null, pinnedSenderId: null },
    });
    if (unpinned.count) notifyConversationChanged(existing.conversationId, await getMemberIds(existing.conversationId));
  }
  const memberIds = await getMemberIds(existing.conversationId);
  await broadcastMessage('message:updated', messageId, memberIds);
}

/** Favoritar (estrela) ou tirar dos favoritos. Só a própria pessoa vê. */
export async function setStar(userId: string, messageId: string, starred: boolean) {
  const m = await memberMessage(userId, messageId);
  if (starred) {
    await prisma.messageStar.upsert({ where: { messageId_userId: { messageId, userId } }, create: { messageId, userId }, update: {} });
  } else {
    await prisma.messageStar.deleteMany({ where: { messageId, userId } });
  }
  const full = await loadMessage(messageId);
  if (full) emitToUsers([userId], 'message:updated', serializeMessage(full, userId));
  return m.conversationId;
}

/** "Dados" da mensagem: quando foi entregue e lida por cada destinatário (só para quem enviou ou o master). */
export async function messageInfo(userId: string, messageId: string) {
  const m = await memberMessage(userId, messageId);
  if (m.senderId !== userId && !(await isMaster(userId))) throw new HttpError(403, 'Só quem enviou vê os dados da mensagem');
  const receipts = await prisma.messageReceipt.findMany({
    where: { messageId },
    select: { userId: true, deliveredAt: true, readAt: true, user: { select: { displayName: true, avatarUrl: true } } },
  });
  return {
    sentAt: m.createdAt.toISOString(),
    receipts: receipts.map((r) => ({
      userId: r.userId,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
    })),
  };
}

const PIN_PREVIEW: Record<string, string> = {
  IMAGE: '📷 Foto',
  VIDEO: '🎥 Vídeo',
  AUDIO: '🎤 Áudio',
  FILE: '📄 Documento',
  LOCATION: '📍 Localização',
  CONTACT: '👤 Contato',
  STICKER: '💟 Figurinha',
};

/** Fixar uma mensagem no topo da conversa (para todos) ou desafixar (messageId = null). */
export async function pinMessage(userId: string, conversationId: string, messageId: string | null) {
  await assertMember(conversationId, userId);
  let data: { pinnedMessageId: string | null; pinnedPreview: string | null; pinnedSenderId: string | null };
  if (messageId) {
    const m = await memberMessage(userId, messageId);
    if (m.conversationId !== conversationId || m.deletedAt) throw new HttpError(404, 'Mensagem não encontrada');
    const kind = m.attachmentType ? PIN_PREVIEW[m.attachmentType] : '';
    data = { pinnedMessageId: m.id, pinnedPreview: (m.body || kind || 'Mensagem').slice(0, 140), pinnedSenderId: m.senderId };
  } else {
    data = { pinnedMessageId: null, pinnedPreview: null, pinnedSenderId: null };
  }
  await prisma.conversation.update({ where: { id: conversationId }, data });
  notifyConversationChanged(conversationId, await getMemberIds(conversationId));
}

export async function listMessages(
  conversationId: string,
  viewerId: string,
  opts: { before?: Date; limit: number },
) {
  const participant = await prisma.participant.findUnique({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    select: { clearedAt: true },
  });
  const createdAt: Prisma.DateTimeFilter = {};
  if (opts.before) createdAt.lt = opts.before;
  if (participant?.clearedAt) createdAt.gt = participant.clearedAt;

  const rows = await prisma.message.findMany({
    // "Apagar para mim": some só para quem apagou.
    where: { conversationId, hiddenFor: { none: { userId: viewerId } }, ...(Object.keys(createdAt).length ? { createdAt } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.limit + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit).reverse();
  return { messages: page.map((m) => serializeMessage(m, viewerId)), hasMore };
}

// ---------------------------------------------------------------------------
// Entregue / lido
// ---------------------------------------------------------------------------

type Affected = { messageId: string; conversationId: string; senderId: string };

/** Recalcula o status das mensagens afetadas e avisa cada remetente. */
async function emitStatusUpdates(items: Affected[]) {
  if (items.length === 0) return;
  const ids = [...new Set(items.map((i) => i.messageId))];
  const receipts = await prisma.messageReceipt.findMany({
    where: { messageId: { in: ids } },
    select: { messageId: true, deliveredAt: true, readAt: true },
  });
  const byMessage = new Map<string, ReceiptTimes[]>();
  for (const r of receipts) {
    const list = byMessage.get(r.messageId) ?? [];
    list.push(r);
    byMessage.set(r.messageId, list);
  }

  // remetente -> conversa -> atualizações
  const grouped = new Map<string, Map<string, { id: string; status: MessageStatus }[]>>();
  for (const item of items) {
    const perConv = grouped.get(item.senderId) ?? new Map();
    const list = perConv.get(item.conversationId) ?? [];
    list.push({ id: item.messageId, status: statusOf(byMessage.get(item.messageId) ?? []) });
    perConv.set(item.conversationId, list);
    grouped.set(item.senderId, perConv);
  }
  for (const [senderId, perConv] of grouped) {
    for (const [conversationId, updates] of perConv) {
      emitToUsers([senderId], 'message:status', { conversationId, updates });
    }
  }
}

/** Chamado quando o usuário conecta: tudo que chegou enquanto estava offline vira "entregue". */
export async function markDelivered(userId: string) {
  const pending = await prisma.messageReceipt.findMany({
    where: { userId, deliveredAt: null },
    select: { messageId: true, conversationId: true, message: { select: { senderId: true } } },
  });
  if (pending.length === 0) return;
  await prisma.messageReceipt.updateMany({
    where: { userId, deliveredAt: null, messageId: { in: pending.map((p) => p.messageId) } },
    data: { deliveredAt: new Date() },
  });
  await emitStatusUpdates(
    pending.map((p) => ({
      messageId: p.messageId,
      conversationId: p.conversationId,
      senderId: p.message.senderId,
    })),
  );
}

export async function markRead(userId: string, conversationId: string) {
  await assertMember(conversationId, userId);
  await prisma.participant.updateMany({
    where: { conversationId, userId, forcedUnread: true },
    data: { forcedUnread: false },
  });
  const unread = await prisma.messageReceipt.findMany({
    where: { userId, conversationId, readAt: null },
    select: { messageId: true, message: { select: { senderId: true } } },
  });
  if (unread.length > 0) {
    const ids = unread.map((u) => u.messageId);
    const now = new Date();
    await prisma.messageReceipt.updateMany({
      where: { userId, messageId: { in: ids }, deliveredAt: null },
      data: { deliveredAt: now },
    });
    await prisma.messageReceipt.updateMany({
      where: { userId, messageId: { in: ids }, readAt: null },
      data: { readAt: now },
    });
    await emitStatusUpdates(
      unread.map((u) => ({ messageId: u.messageId, conversationId, senderId: u.message.senderId })),
    );
  }
  // Sincroniza outros dispositivos do próprio usuário (zera o contador).
  emitToUsers([userId], 'conversation:read', { conversationId });
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

const conversationInclude = {
  participants: { include: { user: { select: { ...userSelect, phone: true } } } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
} satisfies Prisma.ConversationInclude;

type ConversationFull = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

function serializeConversation(
  c: ConversationFull,
  viewerId: string,
  unreadCount: number,
  blockedIds: Set<string>,
  contacts: Map<string, string | null>,
) {
  const me = c.participants.find((p) => p.userId === viewerId);
  const clearedAt = me?.clearedAt ?? null;
  const last = c.messages[0];
  // "Limpar conversa" esconde mensagens anteriores a clearedAt só para quem limpou.
  const visibleLast = last && clearedAt && last.createdAt <= clearedAt ? null : (last ?? null);
  let unread = visibleLast ? unreadCount : 0;
  if (me?.forcedUnread) unread = Math.max(unread, 1);

  const otherDirect = c.type === 'DIRECT' ? c.participants.find((p) => p.userId !== viewerId) : undefined;

  return {
    id: c.id,
    type: c.type,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    lastMessageAt: c.lastMessageAt.toISOString(),
    participants: c.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      user: {
        id: p.user.id,
        username: p.user.username,
        // Nome salvo nos meus contatos; não salvo aparece pelo número (como no WhatsApp).
        displayName: nameFor(contacts, viewerId, p.user),
        profileName: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        isBusiness: p.user.isBusiness,
        lastSeenAt: p.user.lastSeenAt.toISOString(),
      },
    })),
    lastMessage: visibleLast ? serializeMessage(visibleLast, viewerId) : null,
    pinnedMessage: c.pinnedMessageId ? { id: c.pinnedMessageId, preview: c.pinnedPreview ?? '', senderId: c.pinnedSenderId } : null,
    unreadCount: unread,
    archived: !!me?.archivedAt,
    pinned: !!me?.pinnedAt,
    favorited: !!me?.favoritedAt,
    mutedUntil: me?.mutedUntil?.toISOString() ?? null,
    youBlocked: otherDirect ? blockedIds.has(otherDirect.userId) : false,
    disappearSeconds: c.disappearSeconds,
    // Conversa 1:1 com quem não está nos contatos: o app mostra o aviso "Bloquear / Adicionar", como no WhatsApp.
    peerIsContact: otherDirect ? contacts.has(otherDirect.userId) : true,
    // Número da outra pessoa na conversa 1:1 (quem conversa com você vê seu número, igual no WhatsApp).
    peerPhone: otherDirect?.user.phone ?? null,
  };
}

export type SerializedConversation = ReturnType<typeof serializeConversation>;

/** Fixadas primeiro (mais recente por cima), depois as demais por atividade — igual no WhatsApp. */
function sortConversationsForList<T extends { pinned: boolean; lastMessageAt: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

export async function listConversations(viewerId: string, opts: { archived?: boolean } = {}) {
  const participantFilter = opts.archived
    ? { userId: viewerId, archivedAt: { not: null }, hiddenAt: null }
    : { userId: viewerId, archivedAt: null, hiddenAt: null };

  const [conversations, unread, blockedIds, contacts] = await Promise.all([
    prisma.conversation.findMany({
      where: { participants: { some: participantFilter } },
      orderBy: { lastMessageAt: 'desc' },
      include: conversationInclude,
    }),
    prisma.messageReceipt.groupBy({
      by: ['conversationId'],
      where: { userId: viewerId, readAt: null, message: { deletedAt: null } },
      _count: { _all: true },
    }),
    listBlockedIds(viewerId),
    contactNameMap(viewerId),
  ]);
  const unreadBy = new Map(unread.map((u) => [u.conversationId, u._count._all]));
  const blocked = new Set(blockedIds);
  const serialized = conversations.map((c) => serializeConversation(c, viewerId, unreadBy.get(c.id) ?? 0, blocked, contacts),
  );
  return sortConversationsForList(serialized);
}

export async function getConversation(conversationId: string, viewerId: string) {
  await assertMember(conversationId, viewerId);
  const [conversation, unread, blockedIds, contacts] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, include: conversationInclude }),
    prisma.messageReceipt.count({
      where: { userId: viewerId, conversationId, readAt: null, message: { deletedAt: null } },
    }),
    listBlockedIds(viewerId),
    contactNameMap(viewerId),
  ]);
  if (!conversation) throw new HttpError(404, 'Conversa não encontrada');
  return serializeConversation(conversation, viewerId, unread, new Set(blockedIds), contacts);
}

/** Avisa os membros que a conversa mudou (criada, membros alterados). Eles rebuscam os dados. */
export function notifyConversationChanged(conversationId: string, memberIds: string[]) {
  emitToUsers(memberIds, 'conversation:updated', { conversationId });
}

// ---------------------------------------------------------------------------
// Preferências pessoais da conversa (arquivar, fixar, favoritar, silenciar...)
// ---------------------------------------------------------------------------

export async function setConversationPrefs(
  userId: string,
  conversationId: string,
  patch: {
    archived?: boolean;
    pinned?: boolean;
    favorited?: boolean;
    forcedUnread?: boolean;
    mutedUntil?: Date | null;
  },
) {
  await assertMember(conversationId, userId);
  const now = new Date();
  const data: Prisma.ParticipantUpdateInput = {};
  if (patch.archived !== undefined) data.archivedAt = patch.archived ? now : null;
  if (patch.pinned !== undefined) data.pinnedAt = patch.pinned ? now : null;
  if (patch.favorited !== undefined) data.favoritedAt = patch.favorited ? now : null;
  if (patch.forcedUnread !== undefined) data.forcedUnread = patch.forcedUnread;
  if (patch.mutedUntil !== undefined) data.mutedUntil = patch.mutedUntil;

  await prisma.participant.update({ where: { conversationId_userId: { conversationId, userId } }, data });
  return getConversation(conversationId, userId);
}

/** "Limpar conversa": esconde o histórico até agora, só para quem limpou. */
export async function clearConversation(userId: string, conversationId: string) {
  await assertMember(conversationId, userId);
  await prisma.participant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { clearedAt: new Date() },
  });
}

/** "Apagar conversa" (1:1 só): some da lista; volta a aparecer se chegar mensagem nova. */
export async function hideConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (!conversation) throw new HttpError(404, 'Conversa não encontrada');
  if (conversation.type !== 'DIRECT') throw new HttpError(400, 'Para grupos, use "Sair do grupo"');
  await assertMember(conversationId, userId);
  const now = new Date();
  await prisma.participant.update({
    where: { conversationId_userId: { conversationId, userId } },
    // Também limpa o histórico (como "Limpar conversa"): se a conversa reaparecer com uma
    // mensagem nova, começa limpa para quem apagou — não ressuscita as mensagens antigas.
    data: { hiddenAt: now, clearedAt: now },
  });
}
