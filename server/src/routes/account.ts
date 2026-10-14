import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate } from '../errors.js';
import { deleteAccount } from '../services/account.js';
import { vapidPublicKey } from '../services/push.js';

// A pessoa digita "EXCLUIR" no app: evita apagar a conta por um toque sem querer.
const deleteSchema = z.object({ confirm: z.literal('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' }) });
// iPhone (APNs): hexadecimal. Android (FCM): letras, números, ":", "-" e "_" (uns 160 caracteres).
const pushDeviceSchema = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('ios'), token: z.string().regex(/^[0-9a-fA-F]{32,200}$/) }),
  z.object({ platform: z.literal('android'), token: z.string().regex(/^[\w:-]{20,4096}$/) }),
  // Web Push: a inscrição do navegador (endpoint + chaves), guardada como JSON.
  z.object({
    platform: z.literal('web'),
    subscription: z.object({
      endpoint: z.string().url().max(2048),
      keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    }),
  }),
]);

export async function accountRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Configurações › Conta › Excluir minha conta.
  app.delete('/me', { ...auth, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request) => {
    validate(deleteSchema, request.body ?? {});
    await deleteAccount(request.user.sub);
    return { ok: true };
  });

  // App nativo (iPhone/Android): registra (ou atualiza) o aparelho que recebe as notificações desta sessão.
  // Chave pública do Web Push (o navegador precisa dela para se inscrever). null = desativado.
  app.get('/push/vapid', auth, async () => ({ publicKey: vapidPublicKey }));

  app.post('/push/devices', auth, async (request) => {
    const body = validate(pushDeviceSchema, request.body);
    const platform = body.platform;
    const token = body.platform === 'web' ? JSON.stringify(body.subscription) : body.token;
    const data = { userId: request.user.sub, sessionId: request.user.sid!, platform };
    await prisma.pushDevice.upsert({ where: { token }, create: { token, ...data }, update: data });
    return { ok: true };
  });
}
