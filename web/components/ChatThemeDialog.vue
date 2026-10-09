<script setup lang="ts">
import { Check, X } from '@lucide/vue';
import { CHAT_COLORS, WALLPAPERS, type Wallpaper } from '~/composables/usePrefs';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ close: [] }>();

const { prefs, setConversationTheme, wallpaperStyle } = usePrefs();
const current = computed(() => prefs.value.conversationThemes[props.conversationId] ?? {});

// Rascunho: só aplica ao salvar.
const color = ref<string | undefined>(current.value.color);
const wallpaper = ref<Wallpaper | undefined>(current.value.wallpaper);

function save() {
  setConversationTheme(props.conversationId, { color: color.value, wallpaper: wallpaper.value });
  emit('close');
}

function reset() {
  setConversationTheme(props.conversationId, null);
  emit('close');
}

const preview = computed(() => CHAT_COLORS.find((c) => c.id === color.value) ?? CHAT_COLORS[0]!);
const previewWallpaper = computed(() => wallpaper.value ?? prefs.value.wallpaper);
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog theme-dialog" role="dialog" aria-modal="true" aria-label="Tema da conversa">
      <header class="dialog-head">
        <h2>Tema da conversa</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="dialog-body">
        <div
          class="theme-preview wp"
          :style="{ '--mine-rgb': preview.rgb, ...wallpaperStyle(previewWallpaper) }"
        >
          <span class="theme-bubble in">Oi! Tudo bem?</span>
          <span class="theme-bubble out">Tudo ótimo 😄</span>
        </div>

        <span class="settings-label">Cor das suas mensagens</span>
        <div class="color-row">
          <button
            v-for="c in CHAT_COLORS"
            :key="c.id"
            type="button"
            class="color-dot"
            :class="{ active: (color ?? 'app') === c.id }"
            :style="{ '--dot': `rgb(${c.rgb})` }"
            :title="c.label"
            :aria-label="c.label"
            @click="color = c.id"
          >
            <Check v-if="(color ?? 'app') === c.id" :size="14" :stroke-width="3" />
          </button>
        </div>

        <span class="settings-label">Papel de parede</span>
        <div class="wallpaper-grid compact">
          <button
            v-for="w in WALLPAPERS"
            :key="w.id"
            type="button"
            class="wallpaper-option wp"
            :class="{ active: previewWallpaper === w.id }"
            :style="wallpaperStyle(w.id)"
            @click="wallpaper = w.id"
          >
            <span>{{ w.label }}</span>
          </button>
        </div>
        <small class="settings-note">O tema vale só para esta conversa e só neste aparelho.</small>
      </div>
      <footer class="dialog-foot">
        <button class="btn btn-ghost" type="button" @click="reset">Usar o padrão</button>
        <button class="btn btn-primary" type="button" @click="save">Salvar</button>
      </footer>
    </div>
  </div>
</template>
