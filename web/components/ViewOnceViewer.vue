<script setup lang="ts">
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ArrowLeft } from '@lucide/vue';

// Tela cheia da foto/vídeo de visualização única, como no WhatsApp: quem enviou e quando no topo,
// legenda embaixo e print bloqueado (Android). Depois de fechar, não abre mais.
const props = defineProps<{ type: 'IMAGE' | 'VIDEO'; url: string; caption?: string; senderName: string; createdAt: string }>();
const emit = defineEmits<{ close: [] }>();

const when = computed(() => `${formatDayLabel(props.createdAt)} às ${formatTime(props.createdAt)}`);

// APK 1.0.12+: tira print/gravação de tela (sai preto). Em versões antigas ou no navegador, não há como bloquear.
const SecureScreen = registerPlugin<{ enable(): Promise<void>; disable(): Promise<void> }>('SecureScreen');
const native = Capacitor.getPlatform() === 'android';

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => {
  document.addEventListener('keydown', onKey);
  if (native) void SecureScreen.enable().catch(() => {});
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  if (native) void SecureScreen.disable().catch(() => {});
});
</script>

<template>
  <Teleport to="body">
    <div class="overlay once-viewer" role="dialog" aria-modal="true" :aria-label="`${type === 'IMAGE' ? 'Foto' : 'Vídeo'} de visualização única`" @contextmenu.prevent>
      <header class="once-viewer-top">
        <button class="icon-btn camera-icon-btn" type="button" aria-label="Voltar" @click="emit('close')"><ArrowLeft :size="22" :stroke-width="2" /></button>
        <span class="once-viewer-who">
          <strong>{{ senderName }}</strong>
          <small>{{ when }}</small>
        </span>
        <span class="once-viewer-badge" title="Visualização única"><ViewOnceIcon :size="22" :on="true" /></span>
      </header>
      <div class="once-viewer-media">
        <img v-if="type === 'IMAGE'" :src="url" alt="" draggable="false" />
        <video v-else :src="url" autoplay playsinline controls controlslist="nodownload noplaybackrate" disablepictureinpicture />
      </div>
      <footer class="once-viewer-foot">
        <p v-if="caption" class="once-viewer-caption">{{ caption }}</p>
        <p class="once-viewer-hint">
          <ViewOnceIcon :size="14" /> {{ type === 'IMAGE' ? 'Foto' : 'Vídeo' }} de visualização única · some quando você sair
        </p>
      </footer>
    </div>
  </Teleport>
</template>
