<script setup lang="ts">
import { Eye, Trash2, X } from '@lucide/vue';
import type { StatusAuthor, StatusItem } from '~/composables/useStatus';

// Visualizador de status em tela cheia: barrinhas de progresso, toque à direita avança e à esquerda volta,
// segurar pausa. Nos meus: "visto por" e apagar. Termina sozinho no último.
const props = defineProps<{ author: StatusAuthor; mine?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const st = useStatus();
const { confirm } = useConfirm();
const DURATION = 5000;
const index = ref(Math.max(0, props.mine ? 0 : props.author.statuses.findIndex((s) => !s.viewed)));
const progress = ref(0);
const paused = ref(false);
const viewersOpen = ref(false);
const viewerList = ref<{ id: string; displayName: string; avatarUrl: string | null; viewedAt: string }[]>([]);
const video = ref<HTMLVideoElement | null>(null);

const current = computed<StatusItem | undefined>(() => props.author.statuses[index.value]);
let raf = 0;
let last = 0;

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = last ? now - last : 0;
  last = now;
  if (paused.value || viewersOpen.value || !current.value) return;
  if (current.value.type === 'VIDEO') {
    const v = video.value;
    progress.value = v && v.duration ? v.currentTime / v.duration : 0;
    return;
  }
  progress.value += dt / DURATION;
  if (progress.value >= 1) next();
}

function show(i: number) {
  if (i < 0) i = 0;
  if (i >= props.author.statuses.length) return emit('close');
  index.value = i;
  progress.value = 0;
  if (!props.mine) void st.markViewed(props.author, props.author.statuses[i]!);
}
const next = () => show(index.value + 1);
const prev = () => show(index.value - 1);

onMounted(() => {
  show(index.value);
  raf = requestAnimationFrame(tick);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));

// Segurou para pausar: soltar não deve pular para o próximo.
let downAt = 0;
function onDown() {
  downAt = Date.now();
  paused.value = true;
}
function onTap(e: MouseEvent) {
  if (Date.now() - downAt > 300) return;
  const x = e.clientX / window.innerWidth;
  if (x < 0.3) prev();
  else next();
}

async function openViewers() {
  if (!current.value) return;
  viewersOpen.value = true;
  viewerList.value = (await st.viewers(current.value.id).catch(() => ({ viewers: [] }))).viewers;
}

async function removeCurrent() {
  if (!current.value) return;
  paused.value = true;
  const ok = await confirm({ message: 'Apagar este status?', confirmLabel: 'Apagar', danger: true });
  paused.value = false;
  if (!ok) return;
  await st.remove(current.value.id);
  if (!props.author.statuses.length) emit('close');
  else show(Math.min(index.value, props.author.statuses.length - 1));
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`;
};
</script>

<template>
  <div class="status-viewer" @keydown.esc="emit('close')">
    <div class="status-bars">
      <span v-for="(s, i) in author.statuses" :key="s.id"><i :style="{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }" /></span>
    </div>
    <header class="status-top">
      <Avatar :name="author.user.displayName" :seed="author.user.id" :size="38" :src="author.user.avatarUrl" />
      <span class="status-who">
        <strong>{{ mine ? 'Meu status' : author.user.displayName }}</strong>
        <small v-if="current">{{ ago(current.createdAt) }}</small>
      </span>
      <button v-if="mine" class="icon-btn" type="button" aria-label="Apagar status" @click="removeCurrent"><Trash2 :size="20" /></button>
      <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="22" /></button>
    </header>

    <div
      v-if="current"
      class="status-stage"
      :style="current.type === 'TEXT' ? { background: current.background ?? '#0f766e' } : undefined"
      @click="onTap"
      @pointerdown="onDown"
      @pointerup="paused = false"
      @pointerleave="paused = false"
    >
      <p v-if="current.type === 'TEXT'" class="status-text">{{ current.text }}</p>
      <img v-else-if="current.type === 'IMAGE'" :src="current.mediaUrl!" alt="Status" draggable="false" />
      <video v-else ref="video" :key="current.id" :src="current.mediaUrl!" autoplay playsinline @ended="next" />
      <p v-if="current.type !== 'TEXT' && current.text" class="status-caption">{{ current.text }}</p>
    </div>

    <button v-if="mine && current" class="status-views" type="button" @click="openViewers">
      <Eye :size="18" :stroke-width="2" /> {{ current.views ?? 0 }}
    </button>

    <div v-if="viewersOpen" class="overlay" @click.self="viewersOpen = false">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Visto por">
        <header class="dialog-head">
          <h2>Visto por {{ viewerList.length }}</h2>
          <button class="icon-btn" type="button" aria-label="Fechar" @click="viewersOpen = false"><X :size="18" /></button>
        </header>
        <div class="dialog-body">
          <p v-if="!viewerList.length" class="settings-note">Ninguém viu ainda.</p>
          <div v-for="v in viewerList" :key="v.id" class="msg-info-row">
            <span>{{ v.displayName }}</span>
            <time>{{ ago(v.viewedAt) }}</time>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
