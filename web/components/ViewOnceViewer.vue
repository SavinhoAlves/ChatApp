<script setup lang="ts">
import { X } from '@lucide/vue';

// Tela cheia da mídia de visualização única: depois de fechar, não abre mais.
const props = defineProps<{ type: 'IMAGE' | 'VIDEO' | 'AUDIO'; url: string; caption?: string }>();
const emit = defineEmits<{ close: [] }>();

const label = computed(() => (props.type === 'IMAGE' ? 'Foto' : props.type === 'VIDEO' ? 'Vídeo' : 'Áudio'));

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="overlay once-viewer" role="dialog" aria-modal="true" :aria-label="`${label} de visualização única`" @contextmenu.prevent>
      <header class="once-viewer-top">
        <button class="icon-btn camera-icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="22" :stroke-width="2" /></button>
        <span class="once-viewer-title"><ViewOnceIcon :size="18" /> {{ label }} de visualização única</span>
      </header>
      <div class="once-viewer-media" :class="{ audio: type === 'AUDIO' }">
        <img v-if="type === 'IMAGE'" :src="url" alt="" draggable="false" />
        <video v-else-if="type === 'VIDEO'" :src="url" autoplay playsinline controls controlslist="nodownload noplaybackrate" disablepictureinpicture />
        <div v-else class="once-viewer-voice"><VoicePlayer :src="url" :mine="false" /></div>
      </div>
      <p v-if="caption" class="once-viewer-caption">{{ caption }}</p>
      <p class="once-viewer-hint">Ao fechar, esta mídia não poderá ser aberta de novo.</p>
    </div>
  </Teleport>
</template>
