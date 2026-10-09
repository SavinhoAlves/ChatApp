<script setup lang="ts">
import { Clock, Smile, Sticker } from '@lucide/vue';
import { EMOJI_CATEGORIES } from '~/utils/emoji';

const emit = defineEmits<{ emoji: [value: string]; sticker: [id: string] }>();

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
      <p class="picker-title">Figurinhas do Chat</p>
      <div class="sticker-grid">
        <button v-for="s in STICKERS" :key="s.id" type="button" class="sticker-btn" :title="s.label" @click="emit('sticker', s.id)">
          <img :src="`/stickers/${s.id}.svg`" :alt="s.label" width="88" height="88" loading="lazy" />
        </button>
      </div>
    </div>

    <nav class="picker-tabs">
      <button type="button" :class="{ active: tab === 'emoji' }" @click="tab = 'emoji'"><Smile :size="18" :stroke-width="1.9" /> Emoji</button>
      <button type="button" :class="{ active: tab === 'sticker' }" @click="tab = 'sticker'"><Sticker :size="18" :stroke-width="1.9" /> Figurinhas</button>
    </nav>
  </div>
</template>
