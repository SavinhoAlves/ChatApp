import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const parsed = z
  .object({
    NODE_ENV: z.string().default('development'),
    // Em produção o servidor só escuta localhost: quem expõe para a internet é o túnel.
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().default(3001),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
    REDIS_URL: z.preprocess(emptyToUndefined, z.string().optional()),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
    CORS_ORIGINS: z.string().default(''),
    REGISTRATION_OPEN: z.enum(['true', 'false']).default('true'),
    // Pasta do front-end já compilado (nuxt generate). Se não existir, a API roda sozinha.
    WEB_DIST: z.string().default('../web/.output/public'),
    // Pasta onde fotos/áudios/arquivos enviados no chat são salvos.
    UPLOAD_DIR: z.string().default('uploads'),
    // Envio do código de ativação. 'console' só imprime no log do servidor (desenvolvimento).
    SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
    TWILIO_ACCOUNT_SID: z.preprocess(emptyToUndefined, z.string().optional()),
    TWILIO_AUTH_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
    TWILIO_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
    // Ligações: servidor TURN (opcional, recomendado em produção) para chamadas atravessarem qualquer rede.
    TURN_URL: z.preprocess(emptyToUndefined, z.string().optional()),
    TURN_USERNAME: z.preprocess(emptyToUndefined, z.string().optional()),
    TURN_CREDENTIAL: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .safeParse(process.env);

if (!parsed.success) {
  console.error('Configuração inválida (.env):');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  isProd: env.NODE_ENV === 'production',
  host: env.HOST,
  port: env.PORT,
  redisUrl: env.REDIS_URL,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  registrationOpen: env.REGISTRATION_OPEN === 'true',
  webDist: resolve(process.cwd(), env.WEB_DIST),
  uploadDir: resolve(process.cwd(), env.UPLOAD_DIR),
  sms: {
    provider: env.SMS_PROVIDER,
    twilioSid: env.TWILIO_ACCOUNT_SID,
    twilioToken: env.TWILIO_AUTH_TOKEN,
    twilioFrom: env.TWILIO_FROM,
  },
  turn: { url: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL },
};

if (env.SMS_PROVIDER === 'twilio' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) {
  console.error('Configuração inválida (.env): SMS_PROVIDER=twilio exige TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM');
  process.exit(1);
}

/** Tamanho máximo aceito por arquivo enviado no chat (20 MB). */
export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
