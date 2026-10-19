import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

// Atualização do APK: o app pergunta qual é a versão mais nova e baixa daqui.
// Para publicar: com APK_GITHUB_REPO, o servidor baixa sozinho dos Releases do GitHub; ou copie
// "Zynko-X.Y.Z.apk" para a pasta server/apk na VPS.
const apkDir = resolve(process.cwd(), 'apk');
const APK_NAME = /^Zynko-(\d+\.\d+\.\d+)\.apk$/;

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
    const m = APK_NAME.exec(file);
    if (m && (!best || newer(m[1]!, best.version))) best = { version: m[1]!, file };
  }
  return best;
}

const SYNC_INTERVAL_MS = 10 * 60_000;

type Release = { draft: boolean; prerelease: boolean; assets: { name: string; size: number; browser_download_url: string }[] };

/**
 * Traz para a pasta apk o APK mais novo publicado nos Releases do GitHub (APK_GITHUB_REPO).
 * Baixa num ".part" e só renomeia com o tamanho conferido: o app nunca recebe um arquivo pela metade.
 */
async function syncFromGitHub(app: FastifyInstance, repo: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'zynko-server' },
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  let best: { version: string; name: string; size: number; url: string } | null = null;
  for (const release of (await res.json()) as Release[]) {
    if (release.draft || release.prerelease) continue;
    for (const asset of release.assets) {
      const m = APK_NAME.exec(asset.name);
      if (m && (!best || newer(m[1]!, best.version))) best = { version: m[1]!, name: asset.name, size: asset.size, url: asset.browser_download_url };
    }
  }
  const local = latestApk();
  if (!best || (local && !newer(best.version, local.version))) return;

  mkdirSync(apkDir, { recursive: true });
  const part = join(apkDir, `${best.name}.part`);
  try {
    const download = await fetch(best.url, { headers: { 'User-Agent': 'zynko-server' } });
    if (!download.ok || !download.body) throw new Error(`download respondeu ${download.status}`);
    await pipeline(Readable.fromWeb(download.body as import('node:stream/web').ReadableStream), createWriteStream(part));
    if (statSync(part).size !== best.size) throw new Error('tamanho diferente do publicado');
    renameSync(part, join(apkDir, best.name));
    app.log.info(`APK ${best.version} baixado do GitHub (${repo}): o app Android vai oferecer a atualização`);
  } finally {
    rmSync(part, { force: true });
  }
}

export async function appUpdateRoutes(app: FastifyInstance) {
  const repo = config.apkGithubRepo;
  if (repo) {
    let syncing = false;
    const sync = () => {
      if (syncing) return;
      syncing = true;
      syncFromGitHub(app, repo)
        .catch((e) => app.log.warn(`Atualização do APK pelo GitHub falhou: ${(e as Error).message}`))
        .finally(() => (syncing = false));
    };
    sync();
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }

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
