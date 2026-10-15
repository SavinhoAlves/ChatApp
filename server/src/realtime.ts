import { createAdapter } from '@socket.io/redis-adapter';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { bindCallEvents } from './calls.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { HttpError, validate } from './errors.js';
import { emitToUsers, sessionRoom, setRealtime, userRoom } from './io.js';
import { createPresence } from './presence.js';
import {
  getContactIds,
  getMemberIds,
  markDelivered,
  markRead,
  sendMessage,
  stopLiveLocation,
  updateLiveLocation,
} from './services/chat.js';

const mediaAttachmentSchema = z.object({
  kind: z.literal('media'),
  type: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'FILE']),
  url: z.string().min(1),
  mime: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().positive(),
});
const locationAttachmentSchema = z.object({
  kind: z.literal('location'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  liveUntil: z.coerce.date().nullish(),
});
const contactAttachmentSchema = z.object({
  kind: z.literal('contact'),
  contactUserId: z.string().min(1),
});
const stickerAttachmentSchema = z.object({
  kind: z.literal('sticker'),
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
});
const attachmentSchema = z.discriminatedUnion('kind', [
  mediaAttachmentSchema,
  locationAttachmentSchema,
  contactAttachmentSchema,
  stickerAttachmentSchema,
]);

const sendSchema = z
  .object({
    conversationId: z.string().min(1),
    body: z.string().trim().max(4000, 'Mensagem muito longa'),
    replyToId: z.string().nullish(),
    clientId: z.string().max(64).optional(),
    attachment: attachmentSchema.nullish(),
    forwarded: z.boolean().optional(),
  })
  .refine((d) => d.body.length > 0 || !!d.attachment, { message: 'Mensagem vazia' });
const typingSchema = z.object({ conversationId: z.string().min(1), isTyping: z.boolean() });
const readSchema = z.object({ conversationId: z.string().min(1) });
const locationUpdateSchema = z.object({
  messageId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const locationStopSchema = z.object({ messageId: z.string().min(1) });

type Ack = ((response: unknown) => void) | undefined;

/** Limite simples por socket: no máximo 20 mensagens a cada 10 segundos. */
function allowSend(socket: Socket) {
  const now = Date.now();
  const recent: number[] = (socket.data.sendTimes ?? []).filter((t: number) => now - t < 10_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  socket.data.sendTimes = recent;
  return true;
}

/** Limite para atualizações de localização ao vivo: no máximo 1 a cada 4 segundos. */
function allowLocationUpdate(socket: Socket) {
  const now = Date.now();
  const last = socket.data.lastLocationUpdate ?? 0;
  if (now - last < 4000) return false;
  socket.data.lastLocationUpdate = now;
  return true;
}

export async function setupRealtime(app: FastifyInstance, redis?: Redis) {
  const io = new Server(app.server, {
    cors: { origin: config.corsOrigins.length ? config.corsOrigins : false },
    maxHttpBufferSize: 64 * 1024,
  });

  if (redis) io.adapter(createAdapter(redis, redis.duplicate()));

  const presence = await createPresence(redis);
  setRealtime(io, presence);

  // Autenticação: o front envia o JWT em handshake.auth.token.
  // "unauthorized" só quando o login é inválido de verdade (o app desconecta a pessoa ao receber isso).
  // Falha passageira (banco reiniciando etc.) vira "unavailable" e o app só tenta de novo.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    let payload: { sub: string; sid?: string };
    try {
      if (typeof token !== 'string') throw new Error('sem token');
      payload = app.jwt.verify<{ sub: string; sid?: string }>(token);
      if (!payload.sid) throw new Error('token sem sessão');
    } catch (error) {
      app.log.warn({ reason: (error as Error).message, ip: socket.handshake.address }, 'socket recusado: token inválido');
      return next(new Error('unauthorized'));
    }
    try {
      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
        select: { userId: true, revokedAt: true },
      });
      if (!session || session.revokedAt || session.userId !== payload.sub) {
        const reason = !session ? 'sessão não existe' : session.revokedAt ? 'sessão desconectada' : 'sessão de outro usuário';
        app.log.warn({ reason, sid: payload.sid }, 'socket recusado');
        return next(new Error('unauthorized'));
      }
      socket.data.userId = session.userId;
      socket.data.sessionId = payload.sid;
      next();
    } catch (error) {
      app.log.error(error, 'falha ao validar a sessão do socket');
      next(new Error('unavailable'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    socket.join(sessionRoom(socket.data.sessionId as string));
    bindCallEvents(io, socket, app.log);

    // Envolve cada handler: erros esperados viram resposta no ack, nunca derrubam o servidor.
    const handle =
      <T>(schema: z.ZodType<T>, fn: (data: T) => Promise<unknown>) =>
      async (payload: unknown, ack?: Ack) => {
        try {
          const result = await fn(validate(schema, payload));
          if (typeof ack === 'function') ack({ ok: true, ...(result as object) });
        } catch (error) {
          const message = error instanceof HttpError ? error.message : 'Erro interno';
          if (!(error instanceof HttpError)) app.log.error(error);
          if (typeof ack === 'function') ack({ ok: false, error: message });
        }
      };

    socket.on(
      'message:send',
      handle(sendSchema, async (data) => {
        if (!allowSend(socket)) throw new HttpError(429, 'Você está enviando mensagens rápido demais');
        const message = await sendMessage({
          conversationId: data.conversationId,
          senderId: userId,
          body: data.body,
          replyToId: data.replyToId,
          clientId: data.clientId,
          attachment: data.attachment,
          forwarded: data.forwarded,
        });
        return { message, clientId: data.clientId };
      }),
    );

    socket.on(
      'typing',
      handle(typingSchema, async (data) => {
        const memberIds = await getMemberIds(data.conversationId);
        if (!memberIds.includes(userId)) return {};
        emitToUsers(
          memberIds.filter((id) => id !== userId),
          'typing',
          { conversationId: data.conversationId, userId, isTyping: data.isTyping },
        );
        return {};
      }),
    );

    socket.on(
      'conversation:read',
      handle(readSchema, async (data) => {
        await markRead(userId, data.conversationId);
        return {};
      }),
    );

    socket.on(
      'location:update',
      handle(locationUpdateSchema, async (data) => {
        if (!allowLocationUpdate(socket)) throw new HttpError(429, 'Muitas atualizações de localização');
        await updateLiveLocation(userId, data.messageId, data.latitude, data.longitude);
        return {};
      }),
    );

    socket.on(
      'location:stop',
      handle(locationStopSchema, async (data) => {
        await stopLiveLocation(userId, data.messageId);
        return {};
      }),
    );

    socket.on('disconnect', async () => {
      try {
        const wentOffline = await presence.remove(userId, socket.id);
        if (!wentOffline) return;
        const lastSeenAt = new Date();
        await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } });
        emitToUsers(await getContactIds(userId), 'presence', {
          userId,
          online: false,
          lastSeenAt: lastSeenAt.toISOString(),
        });
      } catch (error) {
        app.log.error(error);
      }
    });

    // Inicialização assíncrona (depois de registrar os handlers para não perder eventos).
    void (async () => {
      try {
        const cameOnline = await presence.add(userId, socket.id);
        const contacts = await getContactIds(userId);
        socket.emit('presence:init', { online: await presence.onlineAmong(contacts) });
        if (cameOnline) emitToUsers(contacts, 'presence', { userId, online: true });
        // Mensagens recebidas enquanto estava offline passam a "entregues".
        await markDelivered(userId);
      } catch (error) {
        app.log.error(error);
      }
    })();
  });

  return io;
}
