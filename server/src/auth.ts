import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { prisma } from './db.js';
import { disconnectSession } from './io.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // sid = sessão do aparelho. `signupPhone` marca o token curto de "falta completar o perfil" (sem sid).
    payload: { sub: string; sid?: string; signupPhone?: string };
    user: { sub: string; sid?: string; signupPhone?: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance) {
  // Sem expiração: o login vale até ser desconectado (sair, "Dispositivos conectados" ou
  // "Desconectar outros aparelhos"). Quem manda é a linha em Session, conferida a cada requisição.
  await app.register(fastifyJwt, { secret: config.jwtSecret });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const sid = request.user.sid;
      if (!sid) throw new Error('token sem sessão');
      const session = await prisma.session.findUnique({
        where: { id: sid },
        select: { userId: true, revokedAt: true, lastActiveAt: true },
      });
      if (!session || session.revokedAt || session.userId !== request.user.sub) throw new Error('sessão revogada');
      // Atualiza "última atividade" no máximo a cada 5 minutos.
      if (Date.now() - session.lastActiveAt.getTime() > 5 * 60_000) {
        void prisma.session.update({ where: { id: sid }, data: { lastActiveAt: new Date() } }).catch(() => {});
      }
    } catch {
      reply.code(401).send({ error: 'Sessão inválida ou expirada' });
    }
  });
}

/** Revoga a sessão e derruba os sockets abertos dela. */
export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  disconnectSession(sessionId);
}
