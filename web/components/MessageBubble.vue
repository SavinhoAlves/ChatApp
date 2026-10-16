<script setup lang="ts">
import {
  Ban,
  Check,
  Copy,
  File as FileIcon,
  Forward,
  Info,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Radio,
  Reply,
  RotateCw,
  Star,
  StarOff,
  Timer,
  Trash2,
  Video,
} from '@lucide/vue';
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
  forward: [message: Message];
  info: [message: Message];
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

// Horário sempre à direita, na mesma linha do fim do texto (como no WhatsApp): o texto termina com um
// espaço invisível da largura do horário e o horário fica posicionado no canto de baixo da bolha.
const metaEl = ref<HTMLElement | null>(null);
const metaW = ref(0);
const metaInline = computed(() => !!props.message.body && !props.message.deleted && !callLink.value);
function measureMeta() {
  if (metaEl.value) metaW.value = Math.ceil(metaEl.value.offsetWidth) + 6;
}
onMounted(measureMeta);
watch(() => [props.message.status, props.message.editedAt, props.message.starred], () => nextTick(measureMeta));

const canAct = computed(() => !props.message.deleted && !props.message.id.startsWith('tmp-'));

// Toque longo (celular) ou clique direito abre o menu da mensagem; no celular o botão ⋮ fica escondido.
const press = useLongPress(
  () => {
    if (canAct.value && !props.selecting) menuOpen.value = true;
  },
  { rightClick: false },
);

const canCopy = computed(() => !!props.message.body && !props.message.deleted);
async function copyText() {
  menuOpen.value = false;
  await navigator.clipboard?.writeText(props.message.body).catch(() => {});
}

// O menu fica por cima de tudo (fora da lista), colado na bolha: abaixo dela, ou acima se não couber.
const bubbleEl = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const menuPos = ref<Record<string, string>>({});
watch(menuOpen, async (open) => {
  if (!open || !bubbleEl.value) return;
  const r = bubbleEl.value.getBoundingClientRect();
  const side: Record<string, string> = props.mine ? { right: `${Math.max(8, window.innerWidth - r.right)}px` } : { left: `${Math.max(8, r.left)}px` };
  menuPos.value = { ...side, top: `${r.bottom + 4}px`, visibility: 'hidden' };
  await nextTick();
  const h = menuEl.value?.offsetHeight ?? 0;
  const fitsBelow = r.bottom + 4 + h < window.innerHeight - 8;
  const top = fitsBelow ? r.bottom + 4 : Math.max(8, r.top - 4 - h);
  menuPos.value = { ...side, top: `${top}px` };
});

function closeOnOutsideClick(event: MouseEvent) {
  const t = event.target as Node;
  if (menuOpen.value && root.value && !root.value.contains(t) && !menuEl.value?.contains(t)) menuOpen.value = false;
}
// Rolou a conversa com o menu aberto: fecha (ele não acompanha a bolha).
const closeOnScroll = (e: Event) => {
  if (menuOpen.value && !menuEl.value?.contains(e.target as Node)) menuOpen.value = false;
};
onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick);
  document.addEventListener('scroll', closeOnScroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick);
  document.removeEventListener('scroll', closeOnScroll, true);
});

// Figurinha: "Adicionar às favoritas" / "Remover das favoritas", como a estrela do WhatsApp.
const stickers = useStickers();
const isSticker = computed(() => props.message.attachment?.type === 'STICKER');
const favorite = computed(() => (isSticker.value ? stickers.favoriteByUrl(props.message.attachment?.url) : undefined));

watch(menuOpen, (open) => {
  if (open && isSticker.value && !stickers.loaded.value) void stickers.load().catch(() => {});
});

async function toggleFavorite() {
  menuOpen.value = false;
  try {
    if (favorite.value) await stickers.remove(favorite.value.id);
    else await stickers.addFromMessage(props.message.id);
  } catch {
    // falhou (sem conexão, limite de favoritas): o menu continua mostrando o estado real
  }
}

function act(name: 'reply' | 'edit' | 'remove' | 'forward' | 'info') {
  menuOpen.value = false;
  if (name === 'reply') emit('reply', props.message);
  else if (name === 'edit') emit('edit', props.message);
  else if (name === 'forward') emit('forward', props.message);
  else if (name === 'info') emit('info', props.message);
  else emit('remove', props.message);
}

// Favoritar (estrela) e fixar no topo da conversa.
const isPinned = computed(() => chat.activeConversation.value?.pinnedMessage?.id === props.message.id);
const canForward = computed(() => !!props.message.body || (!!props.message.attachment && props.message.attachment.type !== 'LOCATION'));
async function toggleStar() {
  menuOpen.value = false;
  await chat.setStar(props.message, !props.message.starred).catch(() => {});
}
async function togglePin() {
  menuOpen.value = false;
  await chat.pinMessage(props.message.conversationId, isPinned.value ? null : props.message.id).catch(() => {});
}

// Arrastar a mensagem (celular): para a direita responde; para a esquerda abre os dados (só nas suas).
const SWIPE_TRIGGER = 64;
const swipeX = ref(0);
let swipeStart: { x: number; y: number } | null = null;
let swiping = false;
function onTouchstart(e: TouchEvent) {
  press.onTouchstart(e);
  const t = e.touches[0];
  swipeStart = t && canAct.value && !props.selecting ? { x: t.clientX, y: t.clientY } : null;
  swiping = false;
}
function onTouchmove(e: TouchEvent) {
  press.onTouchmove(e);
  const t = e.touches[0];
  if (!swipeStart || !t) return;
  const dx = t.clientX - swipeStart.x;
  const dy = t.clientY - swipeStart.y;
  if (!swiping) {
    // Só vira arrasto lateral se o dedo andou mais para o lado do que para cima/baixo (senão é rolagem).
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiping = true;
  }
  const allowed = dx > 0 || props.mine ? dx : 0;
  swipeX.value = Math.max(-90, Math.min(90, allowed));
}
function onTouchend() {
  press.onTouchend();
  if (swiping) {
    if (swipeX.value >= SWIPE_TRIGGER) {
      navigator.vibrate?.(10);
      emit('reply', props.message);
    } else if (swipeX.value <= -SWIPE_TRIGGER && props.mine) {
      navigator.vibrate?.(10);
      emit('info', props.message);
    }
  }
  swipeStart = null;
  swiping = false;
  swipeX.value = 0;
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
      ref="bubbleEl"
      class="bubble"
      :class="{ deleted: message.deleted, failed: message.status === 'failed', sticker: !message.deleted && message.attachment?.type === 'STICKER' }"
      :style="swipeX ? { transform: `translateX(${swipeX}px)`, transition: 'none' } : undefined"
      @touchstart.passive="onTouchstart"
      @touchmove.passive="onTouchmove"
      @touchend="onTouchend"
      @touchcancel="onTouchend"
      @contextmenu="press.onContextmenu"
    >
      <button v-if="message.status === 'failed'" class="failed-mark" type="button" aria-label="Falha ao enviar. Tentar de novo" @click.stop="emit('retry', message)">!</button>
      <span v-if="swipeX" class="swipe-hint" :class="swipeX > 0 ? 'reply' : 'info'" :style="{ opacity: Math.min(1, Math.abs(swipeX) / SWIPE_TRIGGER) }">
        <Reply v-if="swipeX > 0" :size="18" :stroke-width="2.2" />
        <Info v-else :size="18" :stroke-width="2.2" />
      </span>
      <div v-if="senderName" class="bubble-sender" :style="senderColor ? { color: senderColor } : undefined">
        {{ senderName }}
        <span v-if="senderBadge" class="sender-badge">⚡ {{ senderBadge }}</span>
      </div>

      <ReplyCard v-if="message.replyTo" class="bubble-reply" :name="replyName ?? ''" :reply="message.replyTo" />

      <div v-if="message.forwarded && !message.deleted" class="bubble-forwarded"><Forward :size="13" :stroke-width="2.2" /> Encaminhada</div>

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
          @click="!press.consumeClick() && (lightbox = true)"
        />
        <video v-else-if="message.attachment?.type === 'VIDEO'" :src="message.attachment.url" class="bubble-video" controls />
        <VoicePlayer v-else-if="message.attachment?.type === 'AUDIO'" :src="message.attachment.url!" :mine="mine" />
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
            <small>{{ formatBytes(message.attachment.size ?? 0) }}</small>
          </span>
        </a>
        <div v-if="callLink" class="bubble-call">
          <span class="bubble-call-icon"><Video v-if="callLink.video" :size="20" /><Phone v-else :size="18" /></span>
          <span class="bubble-call-info">
            <strong>{{ callLink.video ? 'Ligação de vídeo' : 'Ligação de voz' }}</strong>
            <small>Link de ligação do Zynko</small>
          </span>
          <button class="btn btn-primary btn-sm" type="button" @click.stop="emit('join-call', callLink.id)">Entrar</button>
        </div>
        <p v-else-if="message.body" class="bubble-body">{{ message.body }}<span class="meta-spacer" :style="{ width: `${metaW}px` }" /></p>
      </template>

      <div ref="metaEl" class="bubble-meta" :class="{ 'meta-float': metaInline }">
        <Timer v-if="message.expiresAt && !message.deleted" :size="11" :stroke-width="2.4" class="meta-timer" aria-label="Mensagem temporária" />
        <Star v-if="message.starred && !message.deleted" :size="11" :stroke-width="2.4" fill="currentColor" class="meta-star" aria-label="Favoritada" />
        <span v-if="message.editedAt && !message.deleted">editada</span>
        <time>{{ formatTime(message.createdAt) }}</time>
        <StatusTicks v-if="mine && !message.deleted" :status="message.status" />
      </div>

      <button v-if="canAct && !selecting" class="msg-menu-btn" type="button" aria-label="Opções da mensagem" @click.stop="menuOpen = !menuOpen">
        <MoreVertical :size="14" :stroke-width="2" />
      </button>

      <Teleport to="body">
      <div v-if="menuOpen" ref="menuEl" class="menu msg-actions-menu" role="menu" :style="menuPos">
        <button class="menu-item" role="menuitem" type="button" @click="act('reply')"><Reply :size="15" :stroke-width="2" /> Responder</button>
        <button v-if="canForward" class="menu-item" role="menuitem" type="button" @click="act('forward')"><Forward :size="15" :stroke-width="2" /> Encaminhar</button>
        <button v-if="mine" class="menu-item" role="menuitem" type="button" @click="act('info')"><Info :size="15" :stroke-width="2" /> Dados</button>
        <button class="menu-item" role="menuitem" type="button" @click="toggleStar">
          <StarOff v-if="message.starred" :size="15" :stroke-width="2" />
          <Star v-else :size="15" :stroke-width="2" />
          {{ message.starred ? 'Desfavoritar' : 'Favoritar' }}
        </button>
        <button class="menu-item" role="menuitem" type="button" @click="togglePin">
          <PinOff v-if="isPinned" :size="15" :stroke-width="2" />
          <Pin v-else :size="15" :stroke-width="2" />
          {{ isPinned ? 'Desafixar' : 'Fixar na conversa' }}
        </button>
        <button v-if="canCopy" class="menu-item" role="menuitem" type="button" @click="copyText"><Copy :size="15" :stroke-width="2" /> Copiar</button>
        <button v-if="isSticker" class="menu-item" role="menuitem" type="button" @click="toggleFavorite">
          <Star :size="15" :stroke-width="2" /> {{ favorite ? 'Remover das figurinhas' : 'Salvar figurinha' }}
        </button>
        <button v-if="mine && !isSticker && message.body" class="menu-item" role="menuitem" type="button" @click="act('edit')"><Pencil :size="15" :stroke-width="2" /> Editar</button>
        <button class="menu-item danger" role="menuitem" type="button" @click="act('remove')"><Trash2 :size="15" :stroke-width="2" /> Apagar</button>
      </div>
      </Teleport>
    </div>

    <button v-if="message.status === 'failed'" class="retry" type="button" @click="emit('retry', message)">
      <RotateCw :size="12" :stroke-width="2" /> Falha ao enviar · tocar para tentar de novo
    </button>

    <div v-if="lightbox && message.attachment" class="overlay lightbox" @click="lightbox = false">
      <img :src="message.attachment.url" alt="Imagem enviada" />
    </div>
  </div>
</template>
