import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';

// Atualização do APK: o app pergunta qual é a versão mais nova e baixa daqui.
// Para publicar, basta copiar "Zynko-X.Y.Z.apk" para a pasta server/apk na VPS.
const apkDir = resolve(process.cwd(), 'apk');

const parts = (v: string) => v.split('.').map(Number);
function newer(a: string, b: string) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

function latestApk() {
  if (!existsSync(apkDir)) return null;
  let best: { version: string; file: string } | null = null;
  for (const file of readdirSync(apkDir)) {
    const m = /^Zynko-(\d+\.\d+\.\d+)\.apk$/.exec(file);
    if (m && (!best || newer(m[1]!, best.version))) best = { version: m[1]!, file };
  }
  return best;
}

export async function appUpdateRoutes(app: FastifyInstance) {
  app.get('/app/android', async (_request, reply) => {
    const apk = latestApk();
    if (!apk) return reply.code(404).send({ error: 'Nenhuma versão publicada' });
    reply.header('Cache-Control', 'no-cache');
    return { version: apk.version, url: `/api/app/android/${apk.file}`, size: statSync(join(apkDir, apk.file)).size };
  });

  app.get<{ Params: { file: string } }>('/app/android/:file', async (request, reply) => {
    const apk = latestApk();
    if (!apk || request.params.file !== apk.file) return reply.code(404).send({ error: 'Versão não encontrada' });
    reply.header('Content-Type', 'application/vnd.android.package-archive');
    reply.header('Content-Length', statSync(join(apkDir, apk.file)).size);
    return reply.send(createReadStream(join(apkDir, apk.file)));
  });
}
