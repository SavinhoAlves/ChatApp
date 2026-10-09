import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createCallLink } from '../calls.js';
import { config } from '../config.js';
import { validate } from '../errors.js';

const linkSchema = z.object({ conversationId: z.string().min(1).nullish(), video: z.boolean().default(true) });

export async function callRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Servidores ICE para o WebRTC: STUN público + TURN próprio (quando configurado no .env).
  app.get('/calls/ice', auth, async () => {
    const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    if (config.turn.url) iceServers.push({ urls: config.turn.url, username: config.turn.username, credential: config.turn.credential });
    return { iceServers };
  });

  // "Enviar link de ligação": quem abrir o link (logado) entra na chamada.
  app.post('/calls/links', { ...auth, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request) => {
    const data = validate(linkSchema, request.body ?? {});
    const link = await createCallLink(request.user.sub, data.conversationId ?? null, data.video);
    return { link };
  });
}
