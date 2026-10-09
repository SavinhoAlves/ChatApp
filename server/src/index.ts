import { existsSync, mkdirSync } from 'node:fs';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { registerAuth } from './auth.js';
import { sweepExpiredMessages } from './services/conversationTools.js';
import { config, MAX_UPLOAD_SIZE } from './config.js';
import { prisma } from './db.js';
import { HttpError } from './errors.js';
import { setupRealtime } from './realtime.js';
import { authRoutes } from './routes/auth.js';
import { businessRoutes } from './routes/business.js';
import { callRoutes } from './routes/calls.js';
import { contactRoutes } from './routes/contacts.js';
import { listRoutes } from './routes/lists.js';
import { deviceRoutes } from './routes/devices.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { uploadRoutes } from './routes/uploads.js';

const app = Fastify({
  logger: { level: config.isProd ? 'info' : 'debug' },
  // Atrás do Cloudflare Tunnel: confia nos cabeçalhos de proxy para IP/protocolo.
  trustProxy: true,
});

await app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : false });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 } });

await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  keyGenerator: (request) => (request.headers['cf-connecting-ip'] as string | undefined) ?? request.ip,
});

app.addHook('onSend', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'same-origin');
  reply.header('X-Frame-Options', 'DENY');
});

app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.status).send({ error: error.message });
  }
  const status = error.statusCode ?? 500;
  if (status >= 500) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Erro interno do servidor' });
  }
  const message = status === 429 ? 'Muitas tentativas. Aguarde um instante.' : error.message;
  return reply.code(status).send({ error: message });
});

await registerAuth(app);

await app.register(
  async (api) => {
    api.get('/health', async () => ({ ok: true }));
    await api.register(authRoutes);
    await api.register(businessRoutes);
    await api.register(callRoutes);
    await api.register(contactRoutes);
    await api.register(listRoutes);
    await api.register(deviceRoutes);
    await api.register(conversationRoutes);
    await api.register(messageRoutes);
    await api.register(uploadRoutes);
  },
  { prefix: '/api' },
);

// Fotos/áudios/arquivos enviados no chat.
mkdirSync(config.uploadDir, { recursive: true });
await app.register(fastifyStatic, {
  root: config.uploadDir,
  prefix: '/uploads/',
  decorateReply: false,
  cacheControl: true,
  maxAge: '7d',
});

// Front-end compilado (Nuxt em modo SPA) servido pelo próprio servidor: um único processo e uma única porta.
if (existsSync(config.webDist)) {
  await app.register(fastifyStatic, {
    root: config.webDist,
    wildcard: false,
    cacheControl: false,
    setHeaders(reply, filePath) {
      const immutable = filePath.includes('/_nuxt/') || filePath.includes('\\_nuxt\\');
      reply.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  app.setNotFoundHandler((request, reply) => {
    const isApi =
      request.url.startsWith('/api') || request.url.startsWith('/socket.io') || request.url.startsWith('/uploads');
    if (request.method === 'GET' && !isApi) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Não encontrado' });
  });
} else {
  app.log.warn(`Front-end não encontrado em ${config.webDist}. Rodando somente a API.`);
}

const redis = config.redisUrl ? new Redis(config.redisUrl, { maxRetriesPerRequest: null }) : undefined;

await app.ready();
const io = await setupRealtime(app, redis);

await app.listen({ host: config.host, port: config.port });

// Mensagens temporárias: a cada minuto apaga para todos as que venceram.
setInterval(() => {
  sweepExpiredMessages().catch((error) => app.log.error(error, 'falha ao apagar mensagens temporárias'));
}, 60_000);

async function shutdown(signal: string) {
  app.log.info(`${signal} recebido, encerrando...`);
  await io.close();
  await app.close();
  await prisma.$disconnect();
  redis?.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
