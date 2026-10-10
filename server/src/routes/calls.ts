import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createCallLink } from '../calls.js';
import { config } from '../config.js';
import { validate } from '../errors.js';

// Validade da senha temporária do TURN. O app pede outra antes de vencer (ver useCall.ts).
const TURN_TTL_SECONDS = 12 * 60 * 60;

/**
 * Senha temporária no padrão "TURN REST API" do coturn (use-auth-secret): usuário = "<expira>:<id>",
 * senha = HMAC-SHA1(segredo, usuário) em base64. O coturn confere sozinho, sem guardar nada.
 */
function turnCredentials(secret: string, userId: string) {
  const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS}:${userId}`;
  return { username, credential: createHmac('sha1', secret).update(username).digest('base64') };
}

const linkSchema = z.object({ conversationId: z.string().min(1).nullish(), video: z.boolean().default(true) });

export async function callRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Servidores ICE para o WebRTC: STUN público + TURN próprio (quando configurado no .env).
  app.get('/calls/ice', auth, async (request) => {
    const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    const { urls, secret, username, credential } = config.turn;
    if (urls.length) {
      const auth = secret ? turnCredentials(secret, request.user.sub) : { username, credential };
      iceServers.push({ urls, ...auth });
    }
    return { iceServers, ttl: secret ? TURN_TTL_SECONDS : null };
  });

  // "Enviar link de ligação": quem abrir o link (logado) entra na chamada.
  app.post('/calls/links', { ...auth, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request) => {
    const data = validate(linkSchema, request.body ?? {});
    const link = await createCallLink(request.user.sub, data.conversationId ?? null, data.video);
    return { link };
  });
}
