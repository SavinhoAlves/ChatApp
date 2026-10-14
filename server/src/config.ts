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
    // 'smsgate' envia pelo seu próprio Android com o app SMS Gate (https://sms-gate.app), no modo Cloud.
    // 'whatsapp-admin' manda o código para o WhatsApp do administrador (CallMeBot), que repassa à pessoa.
    SMS_PROVIDER: z.enum(['console', 'twilio', 'smsgate', 'whatsapp-admin']).default('console'),
    CALLMEBOT_PHONE: z.preprocess(emptyToUndefined, z.string().optional()),
    CALLMEBOT_APIKEY: z.preprocess(emptyToUndefined, z.string().optional()),
    SMSGATE_URL: z.string().default('https://api.sms-gate.app/3rdparty/v1'),
    SMSGATE_USERNAME: z.preprocess(emptyToUndefined, z.string().optional()),
    SMSGATE_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
    TWILIO_ACCOUNT_SID: z.preprocess(emptyToUndefined, z.string().optional()),
    TWILIO_AUTH_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
    TWILIO_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
    // Ligações: servidor TURN (opcional, recomendado em produção) para chamadas atravessarem qualquer rede.
    // TURN_URL aceita várias, separadas por vírgula (ex.: UDP, TCP e TLS na 5349).
    TURN_URL: z.preprocess(emptyToUndefined, z.string().optional()),
    // Recomendado: segredo compartilhado com o coturn (use-auth-secret). Cada pessoa recebe uma senha
    // temporária assinada com ele. Sem o segredo, usa TURN_USERNAME/TURN_CREDENTIAL fixos.
    TURN_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    // Notificações do app de iPhone (APNs). Chave .p8 criada em developer.apple.com › Keys.
    // Notificações do app Android (Firebase Cloud Messaging): JSON da conta de serviço do Firebase.
    FCM_SERVICE_ACCOUNT_FILE: z.preprocess(emptyToUndefined, z.string().optional()),
    APNS_KEY_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    APNS_TEAM_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    APNS_KEY_FILE: z.preprocess(emptyToUndefined, z.string().optional()),
    APNS_BUNDLE_ID: z.string().default('com.savioalves.chat'),
    // true só para builds de desenvolvimento do Xcode; TestFlight e App Store usam produção.
    APNS_SANDBOX: z.enum(['true', 'false']).default('false'),
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
    smsgateUrl: env.SMSGATE_URL.replace(/\/+$/, ''),
    smsgateUser: env.SMSGATE_USERNAME,
    smsgatePass: env.SMSGATE_PASSWORD,
    callmebotPhone: env.CALLMEBOT_PHONE,
    callmebotApiKey: env.CALLMEBOT_APIKEY,
    // Ligação com o código só existe com Twilio (ou no console, em desenvolvimento).
    canCall: env.SMS_PROVIDER === 'twilio' || env.SMS_PROVIDER === 'console',
  },
  fcm: { serviceAccountFile: env.FCM_SERVICE_ACCOUNT_FILE ? resolve(process.cwd(), env.FCM_SERVICE_ACCOUNT_FILE) : undefined },
  apns: {
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    keyFile: env.APNS_KEY_FILE ? resolve(process.cwd(), env.APNS_KEY_FILE) : undefined,
    bundleId: env.APNS_BUNDLE_ID,
    host: env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  },
  turn: {
    urls: (env.TURN_URL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    secret: env.TURN_SECRET,
    username: env.TURN_USERNAME,
    credential: env.TURN_CREDENTIAL,
  },
};

if (env.SMS_PROVIDER === 'twilio' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) {
  console.error('Configuração inválida (.env): SMS_PROVIDER=twilio exige TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM');
  process.exit(1);
}

if (env.SMS_PROVIDER === 'smsgate' && !(env.SMSGATE_USERNAME && env.SMSGATE_PASSWORD)) {
  console.error('Configuração inválida (.env): SMS_PROVIDER=smsgate exige SMSGATE_USERNAME e SMSGATE_PASSWORD');
  process.exit(1);
}

if (env.SMS_PROVIDER === 'whatsapp-admin' && !(env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY)) {
  console.error('Configuração inválida (.env): SMS_PROVIDER=whatsapp-admin exige CALLMEBOT_PHONE e CALLMEBOT_APIKEY');
  process.exit(1);
}

/** Tamanho máximo aceito por arquivo enviado no chat (20 MB). */
export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
