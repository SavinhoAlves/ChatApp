import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { userSelect } from '../services/chat.js';

function attachmentTypeFor(mime: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

const AVATAR_MIMES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/** Apaga o arquivo da foto antiga (só se for nossa, em /uploads). */
async function removeAvatarFile(url: string | null) {
  if (!url?.startsWith('/uploads/')) return;
  await unlink(join(config.uploadDir, basename(url))).catch(() => {});
}

export async function uploadRoutes(app: FastifyInstance) {
  // Foto de perfil: só imagem (JPG, PNG ou WebP) até 5 MB. Substitui a anterior.
  app.post('/me/avatar', { preHandler: [app.authenticate] }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'Nenhuma imagem enviada');
    const ext = AVATAR_MIMES[file.mimetype];
    if (!ext) {
      file.file.resume();
      throw new HttpError(400, 'Use uma imagem JPG, PNG ou WebP');
    }

    const diskName = `avatar-${randomUUID()}${ext}`;
    const diskPath = join(config.uploadDir, diskName);
    try {
      await pipeline(file.file, createWriteStream(diskPath));
    } catch {
      throw new HttpError(400, 'Falha ao receber a imagem');
    }
    if (file.file.truncated || file.file.bytesRead > MAX_AVATAR_SIZE) {
      await unlink(diskPath).catch(() => {});
      throw new HttpError(413, 'A foto precisa ter no máximo 5 MB');
    }

    const previous = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { avatarUrl: true } });
    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: { avatarUrl: `/uploads/${diskName}` },
      select: userSelect,
    });
    await removeAvatarFile(previous?.avatarUrl ?? null);
    return { user };
  });

  app.delete('/me/avatar', { preHandler: [app.authenticate] }, async (request) => {
    const previous = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { avatarUrl: true } });
    const user = await prisma.user.update({ where: { id: request.user.sub }, data: { avatarUrl: null }, select: userSelect });
    await removeAvatarFile(previous?.avatarUrl ?? null);
    return { user };
  });

  app.post('/uploads', { preHandler: [app.authenticate] }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'Nenhum arquivo enviado');

    const diskName = `${randomUUID()}${extname(file.filename).slice(0, 12)}`;
    const diskPath = join(config.uploadDir, diskName);

    try {
      await pipeline(file.file, createWriteStream(diskPath));
    } catch {
      throw new HttpError(400, 'Falha ao receber o arquivo');
    }

    if (file.file.truncated) {
      await unlink(diskPath).catch(() => {});
      throw new HttpError(413, 'Arquivo maior que o limite de 20 MB');
    }

    return {
      attachment: {
        url: `/uploads/${diskName}`,
        type: attachmentTypeFor(file.mimetype),
        mime: file.mimetype,
        name: file.filename,
        size: file.file.bytesRead,
      },
    };
  });
}
