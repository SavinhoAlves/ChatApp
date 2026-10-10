<script setup lang="ts">
import { Clock, Loader2, Plus, Smile, Star, Sticker } from '@lucide/vue';
import type { StickerRef } from '~/composables/useStickers';
import { EMOJI_CATEGORIES } from '~/utils/emoji';

const emit = defineEmits<{ emoji: [value: string]; sticker: [sticker: StickerRef] }>();

// Mesmos ids de server/src/services/stickers.ts (arquivos em public/stickers).
const STICKERS = [
  { id: 'ola', label: 'Olá!' },
  { id: 'obrigado', label: 'Obrigado!' },
  { id: 'kkkk', label: 'KKKKK' },
  { id: 'amei', label: 'Amei!' },
  { id: 'joinha', label: 'Beleza!' },
  { id: 'triste', label: 'Poxa…' },
  { id: 'uau', label: 'Uau!' },
  { id: 'bom-dia', label: 'Bom dia!' },
  { id: 'boa-noite', label: 'Boa noite' },
  { id: 'parabens', label: 'Parabéns!' },
  { id: 'cafe', label: 'Café?' },
  { id: 'pensando', label: 'Hmm…' },
];

const RECENT_KEY = 'chat.recentEmoji';
const tab = ref<'emoji' | 'sticker'>('emoji');
const recent = ref<string[]>([]);
const scroller = ref<HTMLElement | null>(null);

onMounted(() => {
  try {
    recent.value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').slice(0, 24);
  } catch {
    recent.value = [];
  }
});

function pickEmoji(value: string) {
  recent.value = [value, ...recent.value.filter((e) => e !== value)].slice(0, 24);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {
    // sem armazenamento: recentes valem só nesta sessão
  }
  emit('emoji', value);
}

const stickers = useStickers();
const { confirm, alert } = useConfirm();
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);

// Recentes de favoritas removidas não podem mais ser enviadas (o servidor só aceita as suas).
const recentStickers = computed(() =>
  stickers.recent.value.filter((r) => !r.id.startsWith('u-') || stickers.favorites.value.some((f) => `u-${f.id}` === r.id)),
);

watch(tab, (t) => {
  if (t === 'sticker' && !stickers.loaded.value) void stickers.load().catch(() => {});
});

function pickSticker(s: StickerRef) {
  stickers.markUsed(s);
  emit('sticker', s);
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!files.length) return;
  importing.value = true;
  const res = await stickers.importFiles(files);
  importing.value = false;
  if (res.failed) {
    await alert({
      title: res.ok ? `${res.ok} figurinha(s) adicionada(s)` : 'Não foi possível criar a figurinha',
      message: `${res.failed} arquivo(s) não deram certo. ${res.lastError}`,
    });
  }
}

// Como no WhatsApp: segurar (ou clique direito) numa favorita oferece remover.
async function removeFavorite(id: string) {
  const ok = await confirm({ message: 'Remover esta figurinha das favoritas?', confirmLabel: 'Remover', danger: true });
  if (ok) await stickers.remove(id).catch(() => {});
}

function jumpTo(id: string) {
  scroller.value?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start' });
}
</script>

<template>
  <div class="picker" role="dialog" aria-label="Emojis e figurinhas" @click.stop>
    <template v-if="tab === 'emoji'">
      <nav class="picker-cats" aria-label="Categorias">
        <button v-if="recent.length" type="button" title="Recentes" @click="jumpTo('recent')"><Clock :size="16" :stroke-width="2" /></button>
        <button v-for="cat in EMOJI_CATEGORIES" :key="cat.id" type="button" :title="cat.label" @click="jumpTo(cat.id)">{{ cat.icon }}</button>
      </nav>
      <div ref="scroller" class="picker-scroll">
        <section v-if="recent.length" data-cat="recent">
          <p class="picker-title">Recentes</p>
          <div class="emoji-grid">
            <button v-for="e in recent" :key="`r-${e}`" type="button" class="emoji-btn" @click="pickEmoji(e)">{{ e }}</button>
          </div>
        </section>
        <section v-for="cat in EMOJI_CATEGORIES" :key="cat.id" :data-cat="cat.id">
          <p class="picker-title">{{ cat.label }}</p>
          <div class="emoji-grid">
            <button v-for="(e, i) in cat.emojis" :key="i" type="button" class="emoji-btn" @click="pickEmoji(e)">{{ e }}</button>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="picker-scroll">
      <section v-if="recentStickers.length">
        <p class="picker-title"><Clock :size="12" :stroke-width="2.2" /> Recentes</p>
        <div class="sticker-grid">
          <button v-for="s in recentStickers" :key="`r-${s.url}`" type="button" class="sticker-btn" @click="pickSticker(s)">
            <img :src="s.url" alt="Figurinha" width="88" height="88" loading="lazy" />
          </button>
        </div>
      </section>

      <section>
        <p class="picker-title picker-title-row">
          <span><Star :size="12" :stroke-width="2.2" /> Favoritas</span>
          <button
            type="button"
            class="sticker-create"
            :disabled="importing"
            title="Criar figurinha (imagens ou .webp do WhatsApp)"
            aria-label="Criar figurinha"
            @click="fileInput?.click()"
          >
            <Loader2 v-if="importing" :size="15" class="spin" />
            <Plus v-else :size="16" :stroke-width="2.2" />
          </button>
        </p>
        <div class="sticker-grid">
          <button
            v-for="f in stickers.favorites.value"
            :key="f.id"
            type="button"
            class="sticker-btn"
            title="Segure para remover"
            @click="pickSticker({ id: `u-${f.id}`, url: f.url })"
            @contextmenu.prevent="removeFavorite(f.id)"
          >
            <img :src="f.url" alt="Figurinha favorita" width="88" height="88" loading="lazy" />
          </button>
        </div>
        <p v-if="stickers.loaded.value && !stickers.favorites.value.length" class="sticker-hint">
          Toque no <strong>+</strong> para transformar fotos em figurinhas ou importar os .webp da pasta “WhatsApp Stickers”. Para salvar
          uma figurinha recebida, use o menu dela na conversa.
        </p>
        <input ref="fileInput" type="file" accept="image/webp,image/png,image/jpeg,image/gif" multiple hidden @change="onFiles" />
      </section>

      <section>
        <p class="picker-title">Figurinhas do Chat</p>
        <div class="sticker-grid">
          <button
            v-for="s in STICKERS"
            :key="s.id"
            type="button"
            class="sticker-btn"
            :title="s.label"
            @click="pickSticker({ id: s.id, url: `/stickers/${s.id}.svg` })"
          >
            <img :src="`/stickers/${s.id}.svg`" :alt="s.label" width="88" height="88" loading="lazy" />
          </button>
        </div>
      </section>
    </div>

    <nav class="picker-tabs">
      <button type="button" :class="{ active: tab === 'emoji' }" @click="tab = 'emoji'"><Smile :size="18" :stroke-width="1.9" /> Emoji</button>
      <button type="button" :class="{ active: tab === 'sticker' }" @click="tab = 'sticker'"><Sticker :size="18" :stroke-width="1.9" /> Figurinhas</button>
    </nav>
  </div>
</template>
