<script setup lang="ts">
import { Camera, Contact, FileText, MapPin, Mic, Sticker, Video } from '@lucide/vue';
import type { ReplyPreview } from '~/types';

// Card de resposta (no campo de mensagem e dentro da bolha), como no WhatsApp:
// nome, ícone + tipo ("Foto", "Mensagem de áudio 0:12"...) e a miniatura à direita.
const props = defineProps<{ name: string; reply: ReplyPreview }>();

const att = computed(() => (props.reply.deleted ? null : (props.reply.attachment ?? null)));
const thumb = computed(() => (att.value && ['IMAGE', 'STICKER'].includes(att.value.type) ? att.value.url : undefined));
const videoThumb = computed(() => (att.value?.type === 'VIDEO' ? att.value.url : undefined));

// Duração do áudio: lê só os metadados do arquivo.
const duration = ref('');
watchEffect((onCleanup) => {
  duration.value = '';
  const url = att.value?.type === 'AUDIO' ? att.value.url : undefined;
  if (!url || !import.meta.client) return;
  const audio = new Audio();
  audio.preload = 'metadata';
  const done = () => {
    // Áudios gravados no navegador (webm) às vezes chegam sem duração: força o cálculo indo ao fim.
    if (!Number.isFinite(audio.duration)) {
      audio.currentTime = 1e9;
      return;
    }
    const s = Math.round(audio.duration);
    duration.value = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  audio.addEventListener('loadedmetadata', done);
  audio.addEventListener('durationchange', done);
  audio.src = url;
  onCleanup(() => {
    audio.removeAttribute('src');
    audio.load();
  });
});

const label = computed(() => {
  if (props.reply.deleted) return 'Mensagem apagada';
  if (props.reply.viewOnce) return `${att.value?.type === 'VIDEO' ? 'Vídeo' : att.value?.type === 'AUDIO' ? 'Áudio' : 'Foto'} de visualização única`;
  const body = props.reply.body;
  switch (att.value?.type) {
    case 'IMAGE':
      return body || 'Foto';
    case 'VIDEO':
      return body || 'Vídeo';
    case 'AUDIO':
      return 'Mensagem de áudio';
    case 'STICKER':
      return 'Figurinha';
    case 'FILE':
      return att.value.name || 'Documento';
    case 'LOCATION':
      return 'Localização';
    case 'CONTACT':
      return body || 'Contato';
    default:
      return body;
  }
});
const ICONS: Record<string, unknown> = { IMAGE: Camera, VIDEO: Video, AUDIO: Mic, STICKER: Sticker, FILE: FileText, LOCATION: MapPin, CONTACT: Contact };
const icon = computed(() => (att.value ? (ICONS[att.value.type] ?? null) : null));
</script>

<template>
  <div class="reply-card">
    <div class="reply-card-text">
      <strong>{{ name }}</strong>
      <span>
        <component :is="icon" v-if="icon" :size="14" :stroke-width="2" class="reply-card-icon" />
        {{ label }}<template v-if="duration"> · {{ duration }}</template>
      </span>
    </div>
    <img v-if="thumb" :src="thumb" class="reply-card-thumb" :class="{ sticker: att?.type === 'STICKER' }" alt="" />
    <video v-else-if="videoThumb" :src="`${videoThumb}#t=0.1`" class="reply-card-thumb" muted playsinline preload="metadata" />
    <slot />
  </div>
</template>
