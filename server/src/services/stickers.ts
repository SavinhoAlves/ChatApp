import { prisma } from '../db.js';
import { HttpError } from '../errors.js';

/**
 * Figurinhas que vêm com o app (arquivos em web/public/stickers/<id>.svg).
 * O cliente manda só o id; o servidor monta a URL, então ninguém consegue "figurinhar" um link qualquer.
 */
export const STICKER_IDS = [
  'ola',
  'obrigado',
  'kkkk',
  'amei',
  'joinha',
  'triste',
  'uau',
  'bom-dia',
  'boa-noite',
  'parabens',
  'cafe',
  'pensando',
] as const;

export const isStickerId = (id: string): boolean => (STICKER_IDS as readonly string[]).includes(id);

export const stickerUrl = (id: string) => `/stickers/${id}.svg`;

/** Figurinhas favoritas são enviadas como "u-<id do UserSticker>". */
export const USER_STICKER_PREFIX = 'u-';
export const MAX_USER_STICKERS = 300;
export const MAX_STICKER_SIZE = 1024 * 1024;

/** Só aceitamos figurinhas que já são nossas: arquivos enviados ao servidor ou as do app. */
export const isOwnStickerUrl = (url: string) => /^\/uploads\/[\w.-]+$/.test(url) || /^\/stickers\/[a-z0-9-]+\.svg$/.test(url);

const stickerSelect = { id: true, url: true, createdAt: true } as const;

export function listUserStickers(userId: string) {
  return prisma.userSticker.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: stickerSelect });
}

/** Adiciona às favoritas (ou devolve a existente, se a mesma figurinha já estiver lá). */
export async function addUserSticker(userId: string, url: string) {
  if (!isOwnStickerUrl(url)) throw new HttpError(400, 'Figurinha inválida');
  const existing = await prisma.userSticker.findUnique({ where: { userId_url: { userId, url } }, select: stickerSelect });
  if (existing) return existing;
  if ((await prisma.userSticker.count({ where: { userId } })) >= MAX_USER_STICKERS) {
    throw new HttpError(400, `Você pode ter até ${MAX_USER_STICKERS} figurinhas favoritas`);
  }
  return prisma.userSticker.create({ data: { userId, url }, select: stickerSelect });
}

/** Resolve uma figurinha favorita na hora do envio: só o dono pode mandar as suas. */
export async function userStickerUrl(userId: string, stickerId: string) {
  const row = await prisma.userSticker.findFirst({ where: { id: stickerId, userId }, select: { url: true } });
  if (!row) throw new HttpError(400, 'Figurinha desconhecida');
  return row.url;
}
