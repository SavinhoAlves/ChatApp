import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validate } from '../errors.js';
import { emitToUsers } from '../io.js';
import { assertContacts } from '../services/contacts.js';
import { INVALID_PHONE_MESSAGE, normalizePhone } from '../services/phone.js';
import { exportConversation, reportConversation, setDisappearing } from '../services/conversationTools.js';
import {
  assertMember,
  clearConversation,
  getConversation,
  getMemberIds,
  hideConversation,
  listConversations,
  listMessages,
  markRead,
  notifyConversationChanged,
  sendMessage,
  setConversationPrefs,
} from '../services/chat.js';

const idParam = z.object({ id: z.string().min(1) });
const memberParam = z.object({ id: z.string().min(1), userId: z.string().min(1) });

// Por id (contato da lista) ou por telefone (qualquer pessoa que use o Zynko, mesmo fora dos contatos).
const directSchema = z
  .object({ userId: z.string().min(1).optional(), phone: z.string().trim().max(30).optional() })
  .refine((d) => d.userId || d.phone, { message: 'Informe o contato ou o número' });
const groupSchema = z.object({
  title: z.string().trim().min(1, 'Informe o nome do grupo').max(60),
  memberIds: z.array(z.string().min(1)).min(1, 'Escolha pelo menos um participante').max(256),
});
const addMembersSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(256) });
const renameSchema = z.object({ title: z.string().trim().min(1).max(60) });

const messagesQuery = z.object({
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const sendSchema = z.object({
  body: z.string().trim().min(1, 'Mensagem vazia').max(4000, 'Mensagem muito longa'),
  replyToId: z.string().nullish(),
});
const listQuery = z.object({ archived: z.coerce.boolean().optional().default(false) });
const prefsSchema = z.object({
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
  favorited: z.boolean().optional(),
  forcedUnread: z.boolean().optional(),
  // Minutos de silêncio (null tira o silêncio). Ex.: 8*60, 7*24*60, ou um número bem grande para "sempre".
  muteMinutes: z.number().int().positive().nullable().optional(),
});

export async function conversationRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get('/conversations', auth, async (request) => {
    const { archived } = validate(listQuery, request.query);
    return { conversations: await listConversations(request.user.sub, { archived }) };
  });

  app.get('/conversations/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    return { conversation: await getConversation(id, request.user.sub) };
  });

  // Conversa 1:1 — reaproveita a existente se já houver uma entre o mesmo par.
  app.post('/conversations/direct', auth, async (request) => {
    const me = request.user.sub;
    const data = validate(directSchema, request.body);
    let target: { id: string } | null;
    if (data.phone) {
      const phone = normalizePhone(data.phone);
      if (!phone) throw new HttpError(400, INVALID_PHONE_MESSAGE);
      target = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (!target) throw new HttpError(404, 'Esse número ainda não usa o Zynko');
    } else {
      target = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
      if (!target) throw new HttpError(404, 'Usuário não encontrado');
    }
    const userId = target.id;
    // userId === me é a conversa "Você" (mensagens para si mesmo), com um único participante.
    const self = userId === me;

    const directKey = [me, userId].sort().join(':');
    let conversation = await prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
    if (!conversation) {
      // Como no WhatsApp: dá para mandar mensagem para qualquer número. Quem recebe vê o aviso
      // "não está nos seus contatos" com Bloquear / Adicionar. Bloqueio continua impedindo o envio.
      conversation = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          directKey,
          // A outra pessoa só passa a ver a conversa quando chegar a primeira mensagem (sendMessage tira o hiddenAt).
          participants: { create: self ? [{ userId: me }] : [{ userId: me }, { userId, hiddenAt: new Date() }] },
        },
        select: { id: true },
      });
      notifyConversationChanged(conversation.id, [me]);
    }
    return { conversation: await getConversation(conversation.id, me) };
  });

  app.post('/conversations/group', auth, async (request, reply) => {
    const me = request.user.sub;
    const data = validate(groupSchema, request.body);
    const memberIds = [...new Set(data.memberIds.filter((id) => id !== me))];

    const found = await prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true } });
    if (found.length !== memberIds.length) throw new HttpError(400, 'Algum participante não existe');
    await assertContacts(me, memberIds);

    const conversation = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: data.title,
        participants: {
          create: [{ userId: me, role: 'ADMIN' }, ...memberIds.map((userId) => ({ userId }))],
        },
      },
      select: { id: true },
    });
    notifyConversationChanged(conversation.id, [me, ...memberIds]);
    reply.code(201);
    return { conversation: await getConversation(conversation.id, me) };
  });

  app.patch('/conversations/:id', auth, async (request) => {
    const me = request.user.sub;
    const { id } = validate(idParam, request.params);
    const { title } = validate(renameSchema, request.body);
    const membership = await assertMember(id, me);
    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { type: true } });
    if (conversation?.type !== 'GROUP') throw new HttpError(400, 'Só grupos podem ser renomeados');
    if (membership.role !== 'ADMIN') throw new HttpError(403, 'Apenas administradores podem renomear');

    await prisma.conversation.update({ where: { id }, data: { title } });
    notifyConversationChanged(id, await getMemberIds(id));
    return { conversation: await getConversation(id, me) };
  });

  // Preferências pessoais: arquivar, fixar, favoritar, silenciar, marcar como não lida.
  app.patch('/conversations/:id/prefs', auth, async (request) => {
    const me = request.user.sub;
    const { id } = validate(idParam, request.params);
    const { muteMinutes, ...rest } = validate(prefsSchema, request.body);
    const patch = { ...rest, ...(muteMinutes !== undefined && { mutedUntil: muteMinutes ? new Date(Date.now() + muteMinutes * 60_000) : null }) };
    return { conversation: await setConversationPrefs(me, id, patch) };
  });

  // "Exportar conversa": arquivo .txt no formato do WhatsApp.
  app.get('/conversations/:id/export', auth, async (request, reply) => {
    const { id } = validate(idParam, request.params);
    const { filename, text } = await exportConversation(id, request.user.sub);
    reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return text;
  });

  // "Denunciar": registra para análise; em conversa 1:1 pode bloquear junto.
  app.post('/conversations/:id/report', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { block } = validate(z.object({ block: z.boolean().default(false) }), request.body ?? {});
    return { ok: true, ...(await reportConversation(id, request.user.sub, block)) };
  });

  // Mensagens temporárias: null desliga; 24h, 7 dias ou 90 dias.
  app.patch('/conversations/:id/disappearing', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { seconds } = validate(z.object({ seconds: z.number().int().positive().nullable() }), request.body);
    await setDisappearing(id, request.user.sub, seconds);
    return { conversation: await getConversation(id, request.user.sub) };
  });

  // "Limpar conversa": apaga o histórico da vista de quem pediu, sem afetar quem mais está na conversa.
  app.post('/conversations/:id/clear', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await clearConversation(request.user.sub, id);
    return { ok: true };
  });

  // "Apagar conversa" (1:1): some da lista de quem apagou; a outra pessoa não é afetada.
  app.delete('/conversations/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await hideConversation(request.user.sub, id);
    return { ok: true };
  });

  app.post('/conversations/:id/members', auth, async (request) => {
    const me = request.user.sub;
    const { id } = validate(idParam, request.params);
    const { userIds } = validate(addMembersSchema, request.body);
    const membership = await assertMember(id, me);
    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { type: true } });
    if (conversation?.type !== 'GROUP') throw new HttpError(400, 'Só é possível adicionar pessoas em grupos');
    if (membership.role !== 'ADMIN') throw new HttpError(403, 'Apenas administradores podem adicionar pessoas');

    const existing = new Set(await getMemberIds(id));
    const toAdd = [...new Set(userIds)].filter((u) => !existing.has(u));
    await assertContacts(me, toAdd);
    const valid = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { id: true } });
    if (valid.length > 0) {
      await prisma.participant.createMany({
        data: valid.map((u) => ({ conversationId: id, userId: u.id })),
        skipDuplicates: true,
      });
    }
    notifyConversationChanged(id, await getMemberIds(id));
    return { conversation: await getConversation(id, me) };
  });

  // Remover alguém (admin) ou sair do grupo (o próprio usuário).
  app.delete('/conversations/:id/members/:userId', auth, async (request) => {
    const me = request.user.sub;
    const { id, userId } = validate(memberParam, request.params);
    const membership = await assertMember(id, me);
    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { type: true } });
    if (conversation?.type !== 'GROUP') throw new HttpError(400, 'Só é possível sair de grupos');
    if (userId !== me && membership.role !== 'ADMIN') {
      throw new HttpError(403, 'Apenas administradores podem remover pessoas');
    }

    await prisma.participant.deleteMany({ where: { conversationId: id, userId } });
    const remaining = await prisma.participant.findMany({
      where: { conversationId: id },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, userId: true, role: true },
    });

    if (remaining.length === 0) {
      await prisma.conversation.delete({ where: { id } });
    } else if (!remaining.some((p) => p.role === 'ADMIN')) {
      // Grupo nunca fica sem administrador: o participante mais antigo assume.
      await prisma.participant.update({ where: { id: remaining[0]!.id }, data: { role: 'ADMIN' } });
    }

    emitToUsers([userId], 'conversation:removed', { conversationId: id });
    notifyConversationChanged(id, remaining.map((p) => p.userId));
    return { ok: true };
  });

  app.get('/conversations/:id/messages', auth, async (request) => {
    const me = request.user.sub;
    const { id } = validate(idParam, request.params);
    const { before, limit } = validate(messagesQuery, request.query);
    await assertMember(id, me);
    return listMessages(id, me, { before, limit });
  });

  // "Pesquisar" dentro da conversa: as 50 mensagens mais recentes que contêm o texto.
  app.get('/conversations/:id/search', auth, async (request) => {
    const me = request.user.sub;
    const { id } = validate(idParam, request.params);
    const { q } = validate(z.object({ q: z.string().trim().min(1).max(100) }), request.query);
    const membership = await assertMember(id, me);
    const rows = await prisma.message.findMany({
      where: {
        conversationId: id,
        deletedAt: null,
        body: { contains: q, mode: 'insensitive' },
        ...(membership.clearedAt ? { createdAt: { gt: membership.clearedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, senderId: true, body: true, createdAt: true },
    });
    return { results: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });

  // Fallback REST para envio (o caminho normal é pelo socket).
  app.post('/conversations/:id/messages', auth, async (request, reply) => {
    const { id } = validate(idParam, request.params);
    const data = validate(sendSchema, request.body);
    const message = await sendMessage({
      conversationId: id,
      senderId: request.user.sub,
      body: data.body,
      replyToId: data.replyToId,
    });
    reply.code(201);
    return { message };
  });

  app.post('/conversations/:id/read', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await markRead(request.user.sub, id);
    return { ok: true };
  });
}
