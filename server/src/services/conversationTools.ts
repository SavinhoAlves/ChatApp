import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { emitToUsers } from '../io.js';
import { blockUser } from './blocks.js';
import { assertMember, getMemberIds, notifyConversationChanged } from './chat.js';
import { contactNameMap } from './contacts.js';

/** Durações aceitas para mensagens temporárias (como no WhatsApp). */
export const DISAPPEAR_OPTIONS = [24 * 3600, 7 * 24 * 3600, 90 * 24 * 3600] as const;

const ATTACHMENT_TEXT: Record<string, string> = {
  IMAGE: 'Foto',
  VIDEO: 'Vídeo',
  AUDIO: 'Áudio',
  FILE: 'Arquivo',
  LOCATION: 'Localização',
  CONTACT: 'Contato',
  STICKER: 'Figurinha',
};

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** Mensagens que a pessoa vê nesta conversa (respeita "Limpar conversa"), da mais antiga para a mais nova. */
async function visibleMessages(conversationId: string, viewerId: string, take?: number) {
  const membership = await assertMember(conversationId, viewerId);
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(membership.clearedAt ? { createdAt: { gt: membership.clearedAt } } : {}),
    },
    orderBy: { createdAt: take ? 'desc' : 'asc' },
    ...(take ? { take } : {}),
    include: { sender: { select: { id: true, displayName: true } } },
  });
  return take ? rows.reverse() : rows;
}

async function nameResolver(conversationId: string, viewerId: string) {
  const saved = await contactNameMap(viewerId);
  return (sender: { id: string; displayName: string }) =>
    sender.id === viewerId ? 'Você' : (saved.get(sender.id) ?? sender.displayName);
}

function lineFor(m: Awaited<ReturnType<typeof visibleMessages>>[number], name: string) {
  const parts: string[] = [];
  if (m.attachmentType) {
    const label = ATTACHMENT_TEXT[m.attachmentType] ?? 'Anexo';
    if (m.attachmentType === 'LOCATION' && m.latitude !== null) parts.push(`<${label}: ${m.latitude}, ${m.longitude}>`);
    else if (m.attachmentType === 'CONTACT') parts.push(`<${label}: ${m.contactName ?? ''}>`);
    else parts.push(`<${label}${m.attachmentName ? `: ${m.attachmentName}` : ''}>`);
  }
  if (m.body) parts.push(m.body);
  return `${fmt.format(m.createdAt).replace(',', '')} - ${name}: ${parts.join(' ')}`;
}

/** "Exportar conversa": texto no mesmo formato do WhatsApp (data hora - nome: mensagem). */
export async function exportConversation(conversationId: string, viewerId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, title: true, participants: { select: { user: { select: { id: true, displayName: true } } } } },
  });
  if (!conversation) throw new HttpError(404, 'Conversa não encontrada');
  const nameOf = await nameResolver(conversationId, viewerId);
  const messages = await visibleMessages(conversationId, viewerId);

  const other = conversation.participants.find((p) => p.user.id !== viewerId)?.user;
  const title = conversation.type === 'GROUP' ? (conversation.title ?? 'Grupo') : other ? nameOf(other) : 'Você';
  const header = `Conversa do Chat com ${title}\nExportada em ${fmt.format(new Date())}\n\n`;
  const text = header + messages.map((m) => lineFor(m, nameOf(m.sender))).join('\n') + '\n';
  const safe = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'conversa';
  return { filename: `Conversa do Chat com ${safe}.txt`, text };
}

/** "Denunciar": guarda as últimas mensagens para análise; pode bloquear junto (1:1). */
export async function reportConversation(conversationId: string, reporterId: string, alsoBlock: boolean) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (!conversation) throw new HttpError(404, 'Conversa não encontrada');
  const members = await getMemberIds(conversationId);
  const reportedUserId = conversation.type === 'DIRECT' ? (members.find((id) => id !== reporterId) ?? null) : null;

  const nameOf = await nameResolver(conversationId, reporterId);
  const last = await visibleMessages(conversationId, reporterId, 5);
  const snapshot = last.map((m) => lineFor(m, nameOf(m.sender))).join('\n');

  await prisma.report.create({ data: { reporterId, reportedUserId, conversationId, snapshot } });
  if (alsoBlock && reportedUserId) await blockUser(reporterId, reportedUserId);
  return { blocked: alsoBlock && !!reportedUserId };
}

/** Liga/desliga mensagens temporárias. Em grupos, só administradores (padrão do WhatsApp). */
export async function setDisappearing(conversationId: string, userId: string, seconds: number | null) {
  const membership = await assertMember(conversationId, userId);
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (conversation?.type === 'GROUP' && membership.role !== 'ADMIN') {
    throw new HttpError(403, 'Só administradores podem mudar as mensagens temporárias do grupo');
  }
  if (seconds !== null && !(DISAPPEAR_OPTIONS as readonly number[]).includes(seconds)) {
    throw new HttpError(400, 'Duração inválida');
  }
  await prisma.conversation.update({ where: { id: conversationId }, data: { disappearSeconds: seconds } });
  notifyConversationChanged(conversationId, await getMemberIds(conversationId));
}

/** Apaga para todos as mensagens temporárias vencidas e avisa quem está na conversa. */
export async function sweepExpiredMessages() {
  const expired = await prisma.message.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, conversationId: true },
    take: 1000,
  });
  if (!expired.length) return;

  await prisma.message.deleteMany({ where: { id: { in: expired.map((m) => m.id) } } });
  const byConversation = new Map<string, string[]>();
  for (const m of expired) {
    const list = byConversation.get(m.conversationId) ?? [];
    list.push(m.id);
    byConversation.set(m.conversationId, list);
  }
  for (const [conversationId, messageIds] of byConversation) {
    const members = await getMemberIds(conversationId);
    emitToUsers(members, 'messages:expired', { conversationId, messageIds });
    notifyConversationChanged(conversationId, members);
  }
}
