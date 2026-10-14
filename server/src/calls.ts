import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from './db.js';
import { HttpError, validate } from './errors.js';
import { userRoom } from './io.js';
import { isBlocked } from './services/blocks.js';
import { getMemberIds } from './services/chat.js';
import { contactNameMap } from './services/contacts.js';
import { pushIncomingCall } from './services/push.js';

/**
 * Ligações de voz e vídeo (WebRTC). O servidor só faz a "sinalização": avisa quem está sendo chamado e
 * repassa ofertas/respostas/candidatos ICE entre os participantes. Áudio e vídeo vão direto entre os
 * aparelhos (ou pelo servidor TURN, quando configurado). Grupo = malha: cada um conecta com cada um.
 *
 * O estado das chamadas fica em memória (uma instância do servidor), o que basta para este app.
 */

const MAX_PARTICIPANTS = 8;
const RING_TIMEOUT_MS = 45_000;

type Room = {
  id: string;
  conversationId: string | null;
  video: boolean;
  /** userId → socket que está na chamada. */
  participants: Map<string, string>;
  /** Quem está sendo chamado e ainda não atendeu/recusou. */
  ringing: Set<string>;
  /** Liga por link: qualquer pessoa logada com o link pode entrar. */
  fromLink: boolean;
  /** Quem ligou: reenviado a quem abre o app pela notificação enquanto ainda está chamando. */
  from?: { id: string; displayName: string; avatarUrl: string | null };
  ringTimer?: ReturnType<typeof setTimeout>;
};

const rooms = new Map<string, Room>();

const startSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    userIds: z.array(z.string().min(1)).max(MAX_PARTICIPANTS - 1).optional(),
    video: z.boolean(),
  })
  .refine((d) => d.conversationId || d.userIds?.length, { message: 'Escolha quem chamar' });
const callIdSchema = z.object({ callId: z.string().min(1).max(64) });
const signalSchema = z.object({
  callId: z.string().min(1).max(64),
  to: z.string().min(1),
  data: z.object({
    type: z.enum(['offer', 'answer', 'candidate']),
    sdp: z.string().max(20_000).optional(),
    candidate: z.unknown().optional(),
  }),
});

type Ack = ((response: unknown) => void) | undefined;

/** Nome e foto de quem está na chamada (em ligação por link pode ser alguém fora dos seus contatos). */
async function peopleInfo(ids: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, avatarUrl: true } });
  return users;
}

function roomInfo(room: Room) {
  return {
    callId: room.id,
    conversationId: room.conversationId,
    video: room.video,
    participants: [...room.participants.keys()],
  };
}

export function bindCallEvents(io: Server, socket: Socket, log: FastifyBaseLogger) {
  const userId = socket.data.userId as string;

  // Abriu o app (ex.: tocou na notificação da ligação) com uma chamada ainda tocando: toca aqui também.
  for (const room of rooms.values()) {
    if (room.ringing.has(userId) && room.from) {
      socket.emit('call:incoming', { ...roomInfo(room), from: room.from, group: room.ringing.size + room.participants.size > 2 });
    }
  }

  const handle =
    <T>(schema: z.ZodType<T>, fn: (data: T) => Promise<unknown>) =>
    async (payload: unknown, ack?: Ack) => {
      try {
        const result = await fn(validate(schema, payload));
        if (typeof ack === 'function') ack({ ok: true, ...(result as object) });
      } catch (error) {
        const message = error instanceof HttpError ? error.message : 'Erro interno';
        if (!(error instanceof HttpError)) log.error(error);
        if (typeof ack === 'function') ack({ ok: false, error: message });
      }
    };

  const toSocket = (socketId: string, event: string, payload: unknown) => io.to(socketId).emit(event, payload);
  const toUsers = (ids: string[], event: string, payload: unknown) => {
    if (ids.length) io.to(ids.map(userRoom)).emit(event, payload);
  };

  function endRoom(room: Room, reason: 'ended' | 'missed' | 'declined') {
    clearTimeout(room.ringTimer);
    rooms.delete(room.id);
    for (const socketId of room.participants.values()) toSocket(socketId, 'call:ended', { callId: room.id, reason });
    toUsers([...room.ringing], 'call:ended', { callId: room.id, reason });
  }

  function leave(room: Room, who: string) {
    if (room.participants.get(who) === undefined) return;
    room.participants.delete(who);
    for (const socketId of room.participants.values()) toSocket(socketId, 'call:peer-left', { callId: room.id, userId: who });
    // Sobrou só uma pessoa e ninguém mais tocando: a chamada acabou (link continua válido para entrar de novo).
    if (room.participants.size === 0 || (room.participants.size === 1 && room.ringing.size === 0 && !room.fromLink)) {
      endRoom(room, 'ended');
    }
  }

  // ---- Iniciar: 1:1 ou grupo (pela conversa) ou "Nova ligação em grupo" (pessoas escolhidas) ----
  socket.on(
    'call:start',
    handle(startSchema, async (data) => {
      let targets: string[];
      if (data.conversationId) {
        const members = await getMemberIds(data.conversationId);
        if (!members.includes(userId)) throw new HttpError(404, 'Conversa não encontrada');
        targets = members.filter((id) => id !== userId);
      } else {
        const contacts = await contactNameMap(userId);
        targets = [...new Set(data.userIds)].filter((id) => id !== userId);
        if (targets.some((id) => !contacts.has(id))) throw new HttpError(403, 'Só dá para chamar quem está nos seus contatos');
      }
      if (!targets.length) throw new HttpError(400, 'Não há ninguém para chamar nesta conversa');
      if (targets.length + 1 > MAX_PARTICIPANTS) throw new HttpError(400, `Ligações em grupo têm no máximo ${MAX_PARTICIPANTS} pessoas`);
      // Quem bloqueou você não recebe a chamada.
      const allowed: string[] = [];
      for (const id of targets) if (!(await isBlocked(id, userId))) allowed.push(id);
      if (!allowed.length) throw new HttpError(403, 'Não foi possível chamar esta pessoa');

      const room: Room = {
        id: randomUUID(),
        conversationId: data.conversationId ?? null,
        video: data.video,
        participants: new Map([[userId, socket.id]]),
        ringing: new Set(allowed),
        fromLink: false,
      };
      rooms.set(room.id, room);

      const caller = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, avatarUrl: true } });
      room.from = { id: userId, displayName: caller?.displayName ?? 'Alguém', avatarUrl: caller?.avatarUrl ?? null };
      toUsers(allowed, 'call:incoming', { ...roomInfo(room), from: room.from, group: allowed.length > 1 });
      // App fechado no iPhone: o aviso nativo é o que faz a pessoa saber que está tocando.
      void pushIncomingCall(userId, room.from.displayName, allowed, data.video).catch((err) => log.error(err));
      room.ringTimer = setTimeout(() => {
        // Ninguém atendeu: chamada perdida.
        if (rooms.get(room.id) === room && room.participants.size <= 1) endRoom(room, 'missed');
        else room.ringing.clear();
      }, RING_TIMEOUT_MS);
      return roomInfo(room);
    }),
  );

  // ---- Entrar: atender (quem foi chamado), voltar (membro da conversa) ou por link ----
  socket.on(
    'call:join',
    handle(callIdSchema, async ({ callId }) => {
      let room = rooms.get(callId);
      if (!room) {
        const link = await prisma.callLink.findUnique({ where: { id: callId } });
        if (!link || link.expiresAt.getTime() < Date.now()) throw new HttpError(404, 'Esta ligação já terminou');
        room = { id: link.id, conversationId: link.conversationId, video: link.video, participants: new Map(), ringing: new Set(), fromLink: true };
        rooms.set(room.id, room);
      }
      if (!room.fromLink && !room.ringing.has(userId) && !room.participants.has(userId)) {
        const members = room.conversationId ? await getMemberIds(room.conversationId) : [];
        if (!members.includes(userId)) throw new HttpError(403, 'Você não foi chamado para esta ligação');
      }
      if (room.participants.size >= MAX_PARTICIPANTS && !room.participants.has(userId)) {
        throw new HttpError(409, 'A ligação está cheia');
      }

      const others = [...room.participants.keys()].filter((id) => id !== userId);
      room.ringing.delete(userId);
      room.participants.set(userId, socket.id);
      // Atendeu em um aparelho: para de tocar nos outros aparelhos da mesma pessoa.
      toUsers([userId], 'call:answered-elsewhere', { callId: room.id, socketId: socket.id });
      const [me] = await peopleInfo([userId]);
      for (const id of others) toSocket(room.participants.get(id)!, 'call:peer-joined', { callId: room.id, userId, user: me });
      return { ...roomInfo(room), participants: others, people: await peopleInfo(others) };
    }),
  );

  socket.on(
    'call:decline',
    handle(callIdSchema, async ({ callId }) => {
      const room = rooms.get(callId);
      if (!room || !room.ringing.has(userId)) return {};
      room.ringing.delete(userId);
      for (const socketId of room.participants.values()) toSocket(socketId, 'call:declined', { callId, userId });
      toUsers([userId], 'call:ended', { callId, reason: 'declined' });
      // 1:1 recusada (ou todos recusaram e só sobrou quem ligou): encerra.
      if (room.ringing.size === 0 && room.participants.size <= 1 && !room.fromLink) endRoom(room, 'declined');
      return {};
    }),
  );

  socket.on(
    'call:leave',
    handle(callIdSchema, async ({ callId }) => {
      const room = rooms.get(callId);
      if (room) leave(room, userId);
      return {};
    }),
  );

  // Repasse de oferta/resposta/candidato entre dois participantes da mesma chamada.
  socket.on(
    'call:signal',
    handle(signalSchema, async ({ callId, to, data }) => {
      const room = rooms.get(callId);
      if (!room || room.participants.get(userId) !== socket.id) throw new HttpError(404, 'Ligação não encontrada');
      const target = room.participants.get(to);
      if (target) toSocket(target, 'call:signal', { callId, from: userId, data });
      return {};
    }),
  );

  socket.on('disconnect', () => {
    for (const room of [...rooms.values()]) {
      if (room.participants.get(userId) === socket.id) leave(room, userId);
    }
  });
}

/** Cria um link de ligação (vale 90 dias, como no WhatsApp). */
export async function createCallLink(creatorId: string, conversationId: string | null, video: boolean) {
  if (conversationId) {
    const members = await getMemberIds(conversationId);
    if (!members.includes(creatorId)) throw new HttpError(404, 'Conversa não encontrada');
  }
  return prisma.callLink.create({
    data: { creatorId, conversationId, video, expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000) },
    select: { id: true, video: true, expiresAt: true },
  });
}
