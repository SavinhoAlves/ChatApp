<script setup lang="ts">
import { Ban, Check, File as FileIcon, MapPin, MoreVertical, Pencil, Phone, Radio, Reply, RotateCw, Timer, Trash2, Video } from '@lucide/vue';
import type { Message } from '~/types';

const props = defineProps<{
  message: Message;
  mine: boolean;
  /** Nome do remetente, mostrado em grupos para mensagens de outras pessoas. */
  senderName?: string;
  /** Nome de quem foi respondido (quando a mensagem é uma resposta). */
  replyName?: string;
  /** Grupo: cor do nome, etiqueta (ex.: Admin) e foto de quem enviou ao lado da mensagem. */
  senderColor?: string;
  senderBadge?: string;
  avatarSpace?: boolean;
  avatarUser?: { id: string; displayName: string; avatarUrl?: string | null } | null;
  /** Modo "Selecionar mensagens". */
  selecting?: boolean;
  selected?: boolean;
  /** Piscando por ser o resultado da pesquisa. */
  highlighted?: boolean;
}>();

const emit = defineEmits<{
  reply: [message: Message];
  edit: [message: Message];
  remove: [message: Message];
  retry: [message: Message];
  'contact-open': [userId: string];
  'toggle-select': [message: Message];
  'join-call': [callId: string];
}>();

// Mensagem com link de ligação ("Enviar link de ligação"): mostra um cartão com botão para entrar.
const CALL_LINK = /\/\?call=([A-Za-z0-9_-]{8,64})/;
const callLink = computed(() => {
  if (props.message.deleted || !props.message.body) return null;
  const match = CALL_LINK.exec(props.message.body);
  return match ? { id: match[1]!, video: !props.message.body.includes('Ligação de voz') } : null;
});

const chat = useChat();

const menuOpen = ref(false);
const lightbox = ref(false);
const root = ref<HTMLElement | null>(null);

const isLiveActive = computed(() => {
  const until = props.message.attachment?.liveUntil;
  return !!until && new Date(until).getTime() > Date.now();
});

const isMyActiveShare = computed(() => props.mine && chat.liveShare.value?.messageId === props.message.id);

const locationTitle = computed(() => {
  const a = props.message.attachment;
  if (!a) return '';
  if (!a.liveUntil) return 'Localização atual';
  return isLiveActive.value ? 'Localização em tempo real' : 'Localização ao vivo encerrada';
});

const locationSubtitle = computed(() => {
  const a = props.message.attachment;
  if (a?.liveUntil && isLiveActive.value) return `até ${formatTime(a.liveUntil)}`;
  return 'Toque para abrir no mapa';
});

const osmLink = computed(() => {
  const a = props.message.attachment;
  if (a?.latitude == null || a.longitude == null) return '#';
  return `https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=16/${a.latitude}/${a.longitude}`;
});

// Prévia do mapa: um tile do OpenStreetMap (sem chave de API) recortado e centralizado no ponto exato.
const MAP_TILE_SIZE = 256;
const MAP_ZOOM = 16;
const MAP_CROP_W = 240;
const MAP_CROP_H = 140;

const mapPreview = computed(() => {
  const a = props.message.attachment;
  if (a?.latitude == null || a.longitude == null) return null;
  const n = 2 ** MAP_ZOOM;
  const xFrac = ((a.longitude + 180) / 360) * n;
  const latRad = (a.latitude * Math.PI) / 180;
  const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xFrac);
  const y = Math.floor(yFrac);
  return {
    tileUrl: `https://tile.openstreetmap.org/${MAP_ZOOM}/${x}/${y}.png`,
    imgLeft: MAP_CROP_W / 2 - (xFrac - x) * MAP_TILE_SIZE,
    imgTop: MAP_CROP_H / 2 - (yFrac - y) * MAP_TILE_SIZE,
  };
});

const canAct = computed(() => !props.message.deleted && !props.message.id.startsWith('tmp-'));

function closeOnOutsideClick(event: MouseEvent) {
  if (menuOpen.value && root.value && !root.value.contains(event.target as Node)) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutsideClick));

function act(name: 'reply' | 'edit' | 'remove') {
  menuOpen.value = false;
  if (name === 'reply') emit('reply', props.message);
  else if (name === 'edit') emit('edit', props.message);
  else emit('remove', props.message);
}
</script>

<template>
  <div
    ref="root"
    class="msg-row"
    :class="{ mine, selectable: selecting, selected, highlighted, 'has-avatar': avatarSpace }"
    @click="selecting && !message.deleted && emit('toggle-select', message)"
  >
    <span v-if="selecting && !message.deleted" class="select-check" :class="{ on: selected }" aria-hidden="true">
      <Check v-if="selected" :size="13" :stroke-width="3" />
    </span>
    <span v-if="avatarSpace" class="msg-avatar" aria-hidden="true">
      <Avatar v-if="avatarUser" :name="avatarUser.displayName" :seed="avatarUser.id" :size="34" :src="avatarUser.avatarUrl" />
    </span>
    <div
      class="bubble"
      :class="{ deleted: message.deleted, failed: message.status === 'failed', sticker: !message.deleted && message.attachment?.type === 'STICKER' }"
    >
      <div v-if="senderName" class="bubble-sender" :style="senderColor ? { color: senderColor } : undefined">
        {{ senderName }}
        <span v-if="senderBadge" class="sender-badge">⚡ {{ senderBadge }}</span>
      </div>

      <div v-if="message.replyTo" class="bubble-reply">
        <strong>{{ replyName }}</strong>
        <span>{{ message.replyTo.deleted ? 'Mensagem apagada' : message.replyTo.body }}</span>
      </div>

      <p v-if="message.deleted" class="bubble-body muted-text"><Ban :size="14" :stroke-width="2" /> Mensagem apagada</p>
      <template v-else>
        <img
          v-if="message.attachment?.type === 'STICKER'"
          :src="message.attachment.url"
          class="bubble-sticker"
          :alt="`Figurinha ${message.attachment.name ?? ''}`"
          draggable="false"
        />
        <img
          v-else-if="message.attachment?.type === 'IMAGE'"
          :src="message.attachment.url"
          class="bubble-image"
          alt="Imagem enviada"
          @click="lightbox = true"
        />
        <video v-else-if="message.attachment?.type === 'VIDEO'" :src="message.attachment.url" class="bubble-video" controls />
        <audio v-else-if="message.attachment?.type === 'AUDIO'" :src="message.attachment.url" class="bubble-audio" controls />
        <template v-else-if="message.attachment?.type === 'LOCATION'">
          <a v-if="mapPreview" :href="osmLink" target="_blank" rel="noopener" class="bubble-map" aria-label="Abrir no mapa">
            <span class="bubble-map-crop">
              <img :src="mapPreview.tileUrl" class="bubble-map-tile" :style="{ left: `${mapPreview.imgLeft}px`, top: `${mapPreview.imgTop}px` }" alt="" />
              <MapPin :size="28" :stroke-width="2" class="bubble-map-pin" fill="currentColor" />
              <span v-if="isLiveActive" class="bubble-map-live"><Radio :size="11" :stroke-width="2.4" /> AO VIVO</span>
            </span>
          </a>
          <div class="bubble-location-info">
            <strong>{{ locationTitle }}</strong>
            <small :class="{ live: isLiveActive }">{{ locationSubtitle }}</small>
          </div>
          <button v-if="isMyActiveShare" class="bubble-location-stop" type="button" @click="chat.stopLiveLocation()">
            Parar compartilhamento
          </button>
        </template>
        <template v-else-if="message.attachment?.type === 'CONTACT'">
          <div class="bubble-contact">
            <Avatar :name="message.attachment.contactName ?? '?'" :seed="message.attachment.contactUserId ?? message.id" :size="38" />
            <span class="bubble-contact-info">
              <strong>{{ message.attachment.contactName }}</strong>
              <small>@{{ message.attachment.contactUsername }}</small>
            </span>
          </div>
          <button
            class="btn btn-ghost btn-sm bubble-contact-action"
            type="button"
            @click="emit('contact-open', message.attachment.contactUserId!)"
          >
            Ver conversa
          </button>
        </template>
        <a
          v-else-if="message.attachment"
          :href="message.attachment.url"
          class="bubble-file"
          target="_blank"
          rel="noopener"
          :download="message.attachment.name"
        >
          <span class="bubble-file-icon"><FileIcon :size="18" :stroke-width="1.8" /></span>
          <span class="bubble-file-info">
            <strong>{{ message.attachment.name }}</strong>
            <small>{{ formatBytes(message.attachment.size) }}</small>
          </span>
        </a>
        <div v-if="callLink" class="bubble-call">
          <span class="bubble-call-icon"><Video v-if="callLink.video" :size="20" /><Phone v-else :size="18" /></span>
          <span class="bubble-call-info">
            <strong>{{ callLink.video ? 'Ligação de vídeo' : 'Ligação de voz' }}</strong>
            <small>Link de ligação do Chat</small>
          </span>
          <button class="btn btn-primary btn-sm" type="button" @click.stop="emit('join-call', callLink.id)">Entrar</button>
        </div>
        <p v-else-if="message.body" class="bubble-body">{{ message.body }}</p>
      </template>

      <div class="bubble-meta">
        <Timer v-if="message.expiresAt && !message.deleted" :size="11" :stroke-width="2.4" class="meta-timer" aria-label="Mensagem temporária" />
        <span v-if="message.editedAt && !message.deleted">editada</span>
        <time>{{ formatTime(message.createdAt) }}</time>
        <StatusTicks v-if="mine && !message.deleted" :status="message.status" />
      </div>

      <button v-if="canAct && !selecting" class="msg-menu-btn" type="button" aria-label="Opções da mensagem" @click.stop="menuOpen = !menuOpen">
        <MoreVertical :size="14" :stroke-width="2" />
      </button>

      <div v-if="menuOpen" class="menu" role="menu">
        <button class="menu-item" role="menuitem" type="button" @click="act('reply')"><Reply :size="15" :stroke-width="2" /> Responder</button>
        <button v-if="mine" class="menu-item" role="menuitem" type="button" @click="act('edit')"><Pencil :size="15" :stroke-width="2" /> Editar</button>
        <button v-if="mine" class="menu-item danger" role="menuitem" type="button" @click="act('remove')"><Trash2 :size="15" :stroke-width="2" /> Apagar para todos</button>
      </div>
    </div>

    <button v-if="message.status === 'failed'" class="retry" type="button" @click="emit('retry', message)">
      <RotateCw :size="12" :stroke-width="2" /> Não enviada · tentar de novo
    </button>

    <div v-if="lightbox && message.attachment" class="overlay lightbox" @click="lightbox = false">
      <img :src="message.attachment.url" alt="Imagem enviada" />
    </div>
  </div>
</template>
