export interface StickerRef {
  /** Id enviado ao servidor: o nome de uma figurinha do app ou "u-<id>" para uma favorita. */
  id: string;
  url: string;
}

interface UserSticker {
  id: string;
  url: string;
  createdAt: string;
}

const RECENT_KEY = 'chat.recentStickers';
const MAX_RECENT = 16;
const STICKER_PX = 512;
const MAX_STICKER_BYTES = 1024 * 1024;

/** Desenha a imagem centralizada num quadrado transparente de 512×512 e exporta WebP (o formato do WhatsApp). */
async function toStickerWebp(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = STICKER_PX;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.min(STICKER_PX / bitmap.width, STICKER_PX / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (STICKER_PX - w) / 2, (STICKER_PX - h) / 2, w, h);
  bitmap.close();
  for (const quality of [0.9, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // Safari antigo não gera WebP e devolve PNG; o servidor aceita os dois.
    if (blob && blob.size <= MAX_STICKER_BYTES) return blob;
  }
  throw new Error('Imagem grande demais para virar figurinha');
}

/** Figurinhas favoritas (no servidor, valem em todos os aparelhos) e recentes (neste aparelho), como no WhatsApp. */
export function useStickers() {
  const { api, token } = useAuth();
  const favorites = useState<UserSticker[]>('stickers.favorites', () => []);
  const loaded = useState('stickers.loaded', () => false);
  const recent = useState<StickerRef[]>('stickers.recent', () => []);

  async function load() {
    try {
      recent.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').slice(0, MAX_RECENT);
    } catch {
      recent.value = [];
    }
    favorites.value = (await api<{ stickers: UserSticker[] }>('/stickers')).stickers;
    loaded.value = true;
  }

  function markUsed(s: StickerRef) {
    recent.value = [s, ...recent.value.filter((r) => r.url !== s.url)].slice(0, MAX_RECENT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
    } catch {
      // sem armazenamento: recentes valem só nesta sessão
    }
  }

  function addLocal(sticker: UserSticker) {
    favorites.value = [sticker, ...favorites.value.filter((f) => f.id !== sticker.id)];
  }

  async function uploadSticker(blob: Blob) {
    const form = new FormData();
    form.append('file', blob, blob.type === 'image/png' ? 'sticker.png' : 'sticker.webp');
    try {
      const res = await $fetch<{ sticker: UserSticker }>('/api/stickers', {
        method: 'POST',
        body: form,
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : undefined,
      });
      addLocal(res.sticker);
    } catch (error) {
      const e = error as { data?: { error?: string } };
      throw new Error(e.data?.error ?? 'Falha ao salvar a figurinha');
    }
  }

  /**
   * Cria figurinhas a partir de imagens. Arquivos .webp/.png pequenos (como os da pasta "WhatsApp Stickers")
   * vão como estão, mantendo a animação; o resto é convertido. Devolve quantas deram certo.
   */
  async function importFiles(files: File[]) {
    let ok = 0;
    let lastError = '';
    for (const file of files) {
      try {
        const asIs = (file.type === 'image/webp' || file.type === 'image/png') && file.size <= MAX_STICKER_BYTES;
        await uploadSticker(asIs ? file : await toStickerWebp(file));
        ok++;
      } catch (error) {
        lastError = (error as Error).message;
      }
    }
    return { ok, failed: files.length - ok, lastError };
  }

  async function addFromMessage(messageId: string) {
    addLocal((await api<{ sticker: UserSticker }>('/stickers/from-message', { method: 'POST', body: { messageId } })).sticker);
  }

  async function remove(id: string) {
    await api(`/stickers/${id}`, { method: 'DELETE' });
    favorites.value = favorites.value.filter((f) => f.id !== id);
  }

  const favoriteByUrl = (url: string | undefined) => (url ? favorites.value.find((f) => f.url === url) : undefined);

  return { favorites, recent, loaded, load, markUsed, importFiles, addFromMessage, remove, favoriteByUrl };
}
