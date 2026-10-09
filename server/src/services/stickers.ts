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
