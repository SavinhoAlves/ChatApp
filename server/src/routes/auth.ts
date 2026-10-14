import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { revokeSession } from '../auth.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, validate } from '../errors.js';
import { userSelect } from '../services/chat.js';
import { linkPhoneContacts } from '../services/contacts.js';
import { emitToUsers } from '../io.js';
import { BUSINESS_CATEGORIES } from './business.js';
import { canReceiveSms, INVALID_PHONE_MESSAGE, normalizePhone } from '../services/phone.js';
import { sendAdminCode, sendSms, sendVoiceCode } from '../services/sms.js';
import { createSession, deviceInfoSchema, hashSecret, safeEqual } from '../services/sessions.js';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3; // por número, a cada 10 minutos
const RESEND_COOLDOWN_MS = 45_000;

const phoneSchema = z.string().transform((v, ctx) => {
  const phone = normalizePhone(v);
  if (!phone) ctx.addIssue({ code: 'custom', message: INVALID_PHONE_MESSAGE });
  return phone ?? '';
});

// channel: 'sms' (padrão para celular) ou 'call' (ligação que dita o código — fixo, 0800 e 400x só assim).
const requestCodeSchema = z.object({ phone: phoneSchema, channel: z.enum(['sms', 'call']).optional() });
const verifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 dígitos'),
  device: deviceInfoSchema.optional(),
});
const profileSchema = z.object({
  signupToken: z.string().min(1),
  displayName: z.string().trim().min(1, 'Informe seu nome').max(40),
  // Conta comercial: só a categoria no cadastro; o resto do perfil fica em Configurações.
  businessCategory: z.enum(BUSINESS_CATEGORIES).optional(),
  device: deviceInfoSchema.optional(),
});

/** Gera um @usuário único a partir do nome ("João Silva" → "joao.silva" ou "joao.silva4821"). */
async function generateUsername(displayName: string) {
  const base =
    displayName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .slice(0, 18)
      .replace(/^\.+|\.+$/g, '') || 'usuario';
  const padded = base.length < 3 ? `${base}.chat` : base;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? padded : `${padded}${randomInt(1000, 10000)}`;
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `user${randomInt(10_000_000, 100_000_000)}`;
}

const defaultDevice = deviceInfoSchema.parse({});
const updateMeSchema = z.object({ displayName: z.string().trim().min(1, 'Informe seu nome').max(40) });

export async function authRoutes(app: FastifyInstance) {
  // 1) Pede o código de ativação: por SMS ou por ligação.
  app.post(
    '/auth/phone/request',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request) => {
      const { phone, channel: wanted } = validate(requestCodeSchema, request.body);
      const smsCapable = canReceiveSms(phone);
      const { canCall } = config.sms;
      const viaAdmin = config.sms.provider === 'whatsapp-admin';
      if (!viaAdmin && !smsCapable && !canCall) throw new HttpError(400, 'Este número não recebe SMS. Use um celular.');
      // 'admin': o código vai para o WhatsApp do administrador, que repassa (qualquer número serve).
      const channel = viaAdmin ? 'admin' : canCall && (wanted === 'call' || !smsCapable) ? 'call' : 'sms';
      if (!config.registrationOpen && !(await prisma.user.findUnique({ where: { phone }, select: { id: true } }))) {
        throw new HttpError(403, 'Cadastros estão desativados');
      }

      const since = new Date(Date.now() - CODE_TTL_MS);
      const recent = await prisma.phoneVerification.findMany({
        where: { phone, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (recent.length >= MAX_CODES_PER_WINDOW) {
        throw new HttpError(429, 'Muitos códigos solicitados. Aguarde alguns minutos.');
      }
      if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new HttpError(429, 'Aguarde um instante para pedir outro código.');
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await prisma.phoneVerification.create({
        data: { phone, codeHash: hashSecret(`${phone}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
      });

      try {
        if (channel === 'admin') await sendAdminCode(phone, code);
        else if (channel === 'sms') await sendSms(phone, `Seu código do Zynko é ${code}. Não compartilhe com ninguém.`);
        else await sendVoiceCode(phone, code);
      } catch {
        throw new HttpError(
          502,
          channel === 'call' ? 'Não foi possível ligar agora. Tente novamente.' : 'Não foi possível enviar o código agora. Tente novamente.',
        );
      }

      // Só em desenvolvimento com SMS "console": devolve o código para a tela de login mostrar
      // (facilita cadastrar números de teste). Em produção ou com SMS de verdade, nunca.
      const devCode = !config.isProd && config.sms.provider === 'console' ? code : undefined;
      return { ok: true, phone, channel, canSms: smsCapable, canCall, resendInSeconds: RESEND_COOLDOWN_MS / 1000, devCode };
    },
  );

  // 2) Confere o código. Conta existente → entra; número novo → devolve token curto para completar o perfil.
  app.post(
    '/auth/phone/verify',
    { config: { rateLimit: { max: 15, timeWindow: '10 minutes' } } },
    async (request) => {
      const data = validate(verifySchema, request.body);
      const invalid = new HttpError(400, 'Código inválido ou expirado');

      const verification = await prisma.phoneVerification.findFirst({
        where: { phone: data.phone, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (!verification || verification.attempts >= MAX_ATTEMPTS) throw invalid;

      if (!safeEqual(verification.codeHash, hashSecret(`${data.phone}:${data.code}`))) {
        await prisma.phoneVerification.update({ where: { id: verification.id }, data: { attempts: { increment: 1 } } });
        throw invalid;
      }
      // Uso único: apaga todos os códigos deste número. Se outra requisição já consumiu, falha.
      const consumed = await prisma.phoneVerification.deleteMany({ where: { id: verification.id } });
      if (consumed.count === 0) throw invalid;
      await prisma.phoneVerification.deleteMany({ where: { phone: data.phone } });

      const user = await prisma.user.findUnique({ where: { phone: data.phone }, select: userSelect });
      if (user) {
        const token = await createSession(app, user.id, data.device ?? defaultDevice);
        return { token, user };
      }

      const signupToken = app.jwt.sign({ sub: 'signup', signupPhone: data.phone }, { expiresIn: '15m' });
      return { needsProfile: true, signupToken };
    },
  );

  // 3) Número novo: só pede o nome (o @usuário é gerado) e cria a conta.
  app.post(
    '/auth/phone/profile',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const data = validate(profileSchema, request.body);

      let phone: string | undefined;
      try {
        phone = app.jwt.verify<{ signupPhone?: string }>(data.signupToken).signupPhone;
      } catch {
        phone = undefined;
      }
      if (!phone) throw new HttpError(401, 'Verificação expirada. Peça um novo código.');

      if (!config.registrationOpen) throw new HttpError(403, 'Cadastros estão desativados');

      let user;
      try {
        user = await prisma.user.create({
          data: {
            phone,
            username: await generateUsername(data.displayName),
            displayName: data.displayName,
            ...(data.businessCategory && { isBusiness: true, business: { create: { category: data.businessCategory } } }),
          },
          select: userSelect,
        });
      } catch {
        // Corrida: o número foi cadastrado entre a verificação e agora.
        throw new HttpError(409, 'Este número já tem uma conta. Entre novamente.');
      }

      // Quem já tinha salvo este número ganha o contato (com o nome que deu) e é avisado.
      const linked = await linkPhoneContacts(user.id, phone);
      if (linked.length) emitToUsers([...new Set(linked.map((l) => l.ownerId))], 'contacts:changed', { joinedUserId: user.id });

      reply.code(201);
      return { token: await createSession(app, user.id, data.device ?? defaultDevice), user };
    },
  );

  app.post('/auth/logout', { preHandler: [app.authenticate] }, async (request) => {
    await revokeSession(request.user.sid!);
    return { ok: true };
  });

  // Inclui o próprio número (só o dono vê o dele aqui).
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { ...userSelect, phone: true } });
    if (!user) throw new HttpError(401, 'Sessão inválida');
    // Logins antigos foram emitidos com validade de 30 dias: troca por um token sem expiração da mesma sessão.
    const legacy = typeof (request.user as { exp?: number }).exp === 'number';
    return legacy ? { user, token: app.jwt.sign({ sub: user.id, sid: request.user.sid }) } : { user };
  });

  // Configurações > Perfil: trocar o nome que os contatos veem.
  app.patch('/me', { preHandler: [app.authenticate] }, async (request) => {
    const data = validate(updateMeSchema, request.body);
    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: { displayName: data.displayName },
      select: { ...userSelect, phone: true },
    });
    return { user };
  });
}
