import type { Server } from 'socket.io';
import type { Presence } from './presence.js';

/**
 * Referências compartilhadas do tempo real. As rotas REST e os handlers de socket
 * usam os mesmos serviços, e eles precisam emitir eventos sem importar o servidor.
 */
let io: Server | undefined;
let presence: Presence | undefined;

export function setRealtime(server: Server, p: Presence) {
  io = server;
  presence = p;
}

export function getPresence(): Presence {
  if (!presence) throw new Error('Presença não inicializada');
  return presence;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/** Fecha os sockets de uma sessão revogada ("sair deste dispositivo"). */
export function disconnectSession(sessionId: string) {
  io?.in(sessionRoom(sessionId)).disconnectSockets(true);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (!io || userIds.length === 0) return;
  io.to(userIds.map(userRoom)).emit(event, payload);
}
