import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';

export const deviceInfoSchema = z.object({
  deviceName: z.string().trim().min(1).max(60).default('Navegador'),
  platform: z.enum(['mobile', 'desktop', 'web']).default('web'),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

/** Cria a sessão do aparelho e devolve o JWT que a representa. */
export async function createSession(app: FastifyInstance, userId: string, device: DeviceInfo) {
  const session = await prisma.session.create({
    data: { userId, deviceName: device.deviceName, platform: device.platform },
    select: { id: true },
  });
  return app.jwt.sign({ sub: userId, sid: session.id });
}

/** Hash de segredos curtos (código SMS, segredo do QR). HMAC com o JWT_SECRET como chave. */
export function hashSecret(value: string) {
  return createHmac('sha256', config.jwtSecret).update(value).digest('hex');
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const randomSecret = () => randomBytes(24).toString('base64url');
