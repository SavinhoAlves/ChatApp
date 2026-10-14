import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { revokeSession } from '../auth.js';
import { prisma } from '../db.js';
import { HttpError, validate } from '../errors.js';
import { userSelect } from '../services/chat.js';
import { createSession, deviceInfoSchema, hashSecret, randomSecret, safeEqual } from '../services/sessions.js';

const QR_TTL_MS = 2 * 60_000;

/** O QR carrega "id.segredo". O segredo só existe no desktop e no QR; no banco fica o hash. */
const codeSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9]+\.[A-Za-z0-9_-]+$/, 'QR code inválido') });

function splitCode(code: string) {
  const [id, secret] = code.split('.') as [string, string];
  return { id, secret };
}

async function findValidQr(code: string) {
  const { id, secret } = splitCode(code);
  const qr = await prisma.qrLogin.findUnique({ where: { id } });
  if (!qr || !safeEqual(qr.secretHash, hashSecret(secret))) throw new HttpError(404, 'QR code inválido');
  if (qr.expiresAt.getTime() < Date.now()) throw new HttpError(410, 'QR code expirado');
  return qr;
}

export async function deviceRoutes(app: FastifyInstance) {
  // ---- Desktop (sem login): gera o QR e fica consultando até o celular aprovar ----
  app.post(
    '/auth/qr',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const device = validate(deviceInfoSchema, request.body ?? {});
      // O QR é só para computador: o celular entra pelo número (como no WhatsApp).
      if (device.platform === 'mobile') throw new HttpError(400, 'No celular, entre com o seu número.');
      // Limpeza oportunista de pedidos antigos.
      void prisma.qrLogin.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60_000) } } }).catch(() => {});

      const secret = randomSecret();
      const qr = await prisma.qrLogin.create({
        data: {
          secretHash: hashSecret(secret),
          deviceName: device.deviceName,
          platform: device.platform,
          expiresAt: new Date(Date.now() + QR_TTL_MS),
        },
      });
      return { code: `${qr.id}.${secret}`, expiresAt: qr.expiresAt };
    },
  );

  app.post(
    '/auth/qr/status',
    { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } },
    async (request) => {
      const { code } = validate(codeSchema, request.body);
      const { id } = splitCode(code);
      let qr;
      try {
        qr = await findValidQr(code);
      } catch (e) {
        if (e instanceof HttpError && e.status === 410) return { status: 'expired' };
        throw e;
      }
      if (!qr.userId) return { status: 'pending' };

      // Resgate de uso único: só uma requisição consegue marcar como retirado.
      const claimed = await prisma.qrLogin.updateMany({ where: { id, claimedAt: null }, data: { claimedAt: new Date() } });
      if (claimed.count === 0) return { status: 'expired' };

      const user = await prisma.user.findUnique({ where: { id: qr.userId }, select: userSelect });
      if (!user) throw new HttpError(401, 'Usuário inexistente');
      const token = await createSession(app, user.id, {
        deviceName: qr.deviceName,
        platform: qr.platform as 'mobile' | 'desktop' | 'web',
      });
      return { status: 'approved', token, user };
    },
  );

  // ---- Celular (logado): lê o QR, confere de qual aparelho é e aprova ----
  app.post(
    '/auth/qr/preview',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { code } = validate(codeSchema, request.body);
      const qr = await findValidQr(code);
      if (qr.userId) throw new HttpError(409, 'Este QR code já foi usado');
      return { deviceName: qr.deviceName, platform: qr.platform };
    },
  );

  app.post(
    '/auth/qr/approve',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { code } = validate(codeSchema, request.body);
      const qr = await findValidQr(code);
      if (qr.platform === 'mobile') throw new HttpError(400, 'Só dá para conectar um computador por QR code.');
      const approved = await prisma.qrLogin.updateMany({
        where: { id: qr.id, userId: null, claimedAt: null },
        data: { userId: request.user.sub },
      });
      if (approved.count === 0) throw new HttpError(409, 'Este QR code já foi usado');
      return { ok: true };
    },
  );

  // ---- Dispositivos conectados ----
  app.get('/devices', { preHandler: [app.authenticate] }, async (request) => {
    // "Dispositivos": só os computadores conectados por QR code (o próprio celular não aparece).
    const sessions = await prisma.session.findMany({
      where: { userId: request.user.sub, revokedAt: null, platform: { not: 'mobile' } },
      orderBy: { lastActiveAt: 'desc' },
      select: { id: true, deviceName: true, platform: true, createdAt: true, lastActiveAt: true },
    });
    return { devices: sessions.map((s) => ({ ...s, current: s.id === request.user.sid })) };
  });

  // "Desconectar todos os outros aparelhos": mantém só a sessão atual.
  app.delete('/devices', { preHandler: [app.authenticate] }, async (request) => {
    const others = await prisma.session.findMany({
      where: { userId: request.user.sub, revokedAt: null, id: { not: request.user.sid } },
      select: { id: true },
    });
    for (const s of others) await revokeSession(s.id);
    return { ok: true, revoked: others.length };
  });

  app.delete('/devices/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const session = await prisma.session.findFirst({ where: { id, userId: request.user.sub, revokedAt: null } });
    if (!session) throw new HttpError(404, 'Dispositivo não encontrado');
    await revokeSession(id);
    return { ok: true };
  });
}
