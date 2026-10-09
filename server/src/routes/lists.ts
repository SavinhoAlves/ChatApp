import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validate } from '../errors.js';
import { assertMember } from '../services/chat.js';

const idParam = z.object({ id: z.string().min(1) });
const itemParam = z.object({ id: z.string().min(1), conversationId: z.string().min(1) });
const nameSchema = z.object({ name: z.string().trim().min(1, 'Dê um nome para a lista').max(40) });
const createSchema = nameSchema.extend({ conversationIds: z.array(z.string().min(1)).max(500).default([]) });
const itemSchema = z.object({ conversationId: z.string().min(1) });

const listSelect = { id: true, name: true, items: { select: { conversationId: true } } } as const;
const serialize = (l: { id: string; name: string; items: { conversationId: string }[] }) => ({
  id: l.id,
  name: l.name,
  conversationIds: l.items.map((i) => i.conversationId),
});

/** Listas personalizadas ("Adicionar à lista"): cada pessoa organiza as próprias conversas. */
export async function listRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  async function ownList(id: string, ownerId: string) {
    const list = await prisma.chatList.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!list) throw new HttpError(404, 'Lista não encontrada');
    return list;
  }

  app.get('/lists', auth, async (request) => {
    const lists = await prisma.chatList.findMany({
      where: { ownerId: request.user.sub },
      orderBy: { createdAt: 'asc' },
      select: listSelect,
    });
    return { lists: lists.map(serialize) };
  });

  app.post('/lists', auth, async (request, reply) => {
    const me = request.user.sub;
    const data = validate(createSchema, request.body);
    if (await prisma.chatList.findFirst({ where: { ownerId: me, name: data.name }, select: { id: true } })) {
      throw new HttpError(409, 'Você já tem uma lista com esse nome');
    }
    for (const conversationId of data.conversationIds) await assertMember(conversationId, me);
    const list = await prisma.chatList.create({
      data: {
        ownerId: me,
        name: data.name,
        items: { create: [...new Set(data.conversationIds)].map((conversationId) => ({ conversationId })) },
      },
      select: listSelect,
    });
    reply.code(201);
    return { list: serialize(list) };
  });

  app.patch('/lists/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { name } = validate(nameSchema, request.body);
    await ownList(id, request.user.sub);
    try {
      const list = await prisma.chatList.update({ where: { id }, data: { name }, select: listSelect });
      return { list: serialize(list) };
    } catch {
      throw new HttpError(409, 'Você já tem uma lista com esse nome');
    }
  });

  app.delete('/lists/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await ownList(id, request.user.sub);
    await prisma.chatList.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/lists/:id/items', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { conversationId } = validate(itemSchema, request.body);
    await ownList(id, request.user.sub);
    await assertMember(conversationId, request.user.sub);
    await prisma.chatListItem.upsert({
      where: { listId_conversationId: { listId: id, conversationId } },
      create: { listId: id, conversationId },
      update: {},
    });
    return { ok: true };
  });

  app.delete('/lists/:id/items/:conversationId', auth, async (request) => {
    const { id, conversationId } = validate(itemParam, request.params);
    await ownList(id, request.user.sub);
    await prisma.chatListItem.deleteMany({ where: { listId: id, conversationId } });
    return { ok: true };
  });
}
