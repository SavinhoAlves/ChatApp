import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, validate } from '../errors.js';
import { assertMember } from '../services/chat.js';
import { addUserSticker, listUserStickers, MAX_STICKER_SIZE } from '../services/stickers.js';

const idParam = z.object({ id: z.string().min(1) });
const fromMessageSchema = z.object({ messageId: z.string().min(1) });

/** Confere pelos primeiros bytes (não pelo nome) que é mesmo WebP ou PNG. Figurinhas do WhatsApp são WebP. */
function stickerExt(buf: Buffer): '.webp' | '.png' | null {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  return null;
}

export async function stickerRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Minhas figurinhas favoritas, mais recentes primeiro.
  app.get('/stickers', auth, async (request) => ({ stickers: await listUserStickers(request.user.sub) }));

  // Criar/importar: um arquivo WebP ou PNG por requisição (até 1 MB), já no formato de figurinha.
  app.post('/stickers', auth, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'Nenhuma imagem enviada');
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      throw new HttpError(400, 'Falha ao receber a figurinha');
    }
    if (buf.length > MAX_STICKER_SIZE) throw new HttpError(413, 'A figurinha precisa ter no máximo 1 MB');
    const ext = stickerExt(buf);
    if (!ext) throw new HttpError(400, 'Use uma figurinha WebP ou PNG');

    const diskName = `sticker-${randomUUID()}${ext}`;
    await writeFile(join(config.uploadDir, diskName), buf);
    return { sticker: await addUserSticker(request.user.sub, `/uploads/${diskName}`) };
  });

  // "Adicionar às favoritas" a partir de uma figurinha que apareceu numa conversa minha.
  app.post('/stickers/from-message', auth, async (request) => {
    const { messageId } = validate(fromMessageSchema, request.body);
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, attachmentType: true, attachmentUrl: true, deletedAt: true },
    });
    if (!message || message.deletedAt || message.attachmentType !== 'STICKER' || !message.attachmentUrl) {
      throw new HttpError(404, 'Figurinha não encontrada');
    }
    await assertMember(message.conversationId, request.user.sub);
    return { sticker: await addUserSticker(request.user.sub, message.attachmentUrl) };
  });

  // Remove das favoritas. O arquivo fica: a mesma figurinha pode estar em mensagens e nas favoritas de outros.
  app.delete('/stickers/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { count } = await prisma.userSticker.deleteMany({ where: { id, userId: request.user.sub } });
    if (!count) throw new HttpError(404, 'Figurinha não encontrada');
    return { ok: true };
  });
}
