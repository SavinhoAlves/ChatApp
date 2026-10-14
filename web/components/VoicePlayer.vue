<script lang="ts">
// Ondas e duração já calculadas, por arquivo (não decodifica de novo ao rolar a conversa).
const cache = new Map<string, Promise<{ peaks: number[]; duration: number } | null>>();
const BARS = 36;

function analyze(src: string) {
  let job = cache.get(src);
  if (!job) {
    job = (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const peaks: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let peak = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) peak = Math.max(peak, Math.abs(data[j]!));
          peaks.push(peak);
        }
        const max = Math.max(...peaks, 0.01);
        return { peaks: peaks.map((p) => Math.max(0.12, p / max)), duration: audio.duration };
      } catch {
        return null;
      }
    })();
    cache.set(src, job);
  }
  return job;
}
</script>

<script setup lang="ts">
import { Pause, Play } from '@lucide/vue';

// Player de mensagem de voz no estilo WhatsApp: play/pausa, ondas do próprio áudio (tocar nelas pula
// para o ponto), tempo e velocidade 1×/1,5×/2×. Substitui o <audio controls> do sistema, que no
// Android mostrava "Erro" com áudios WebM sem duração gravada.
const props = defineProps<{ src: string; mine?: boolean }>();

const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const current = ref(0);
const duration = ref(0);
const peaks = ref<number[]>(Array(BARS).fill(0.3));
const rate = ref(1);
const failed = ref(false);

onMounted(async () => {
  const result = await analyze(props.src);
  if (result) {
    peaks.value = result.peaks;
    if (!duration.value || !Number.isFinite(duration.value)) duration.value = result.duration;
  }
});

function onMeta() {
  const d = audio.value?.duration ?? 0;
  if (Number.isFinite(d) && d > 0) duration.value = d;
}

async function toggle() {
  const el = audio.value;
  if (!el) return;
  if (playing.value) {
    el.pause();
    return;
  }
  // Só um áudio tocando por vez.
  document.querySelectorAll('audio').forEach((a) => a !== el && a.pause());
  try {
    failed.value = false;
    el.playbackRate = rate.value;
    await el.play();
  } catch {
    failed.value = true;
  }
}

function seek(e: MouseEvent) {
  const el = audio.value;
  if (!el || !duration.value) return;
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  el.currentTime = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * duration.value;
  current.value = el.currentTime;
}

function cycleRate() {
  rate.value = rate.value === 1 ? 1.5 : rate.value === 1.5 ? 2 : 1;
  if (audio.value) audio.value.playbackRate = rate.value;
}

const progress = computed(() => (duration.value ? Math.min(1, current.value / duration.value) : 0));
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const timeLabel = computed(() => fmt(playing.value || current.value ? current.value : duration.value));
</script>

<template>
  <div class="voice" :class="{ mine, playing }" @click.stop>
    <button class="voice-play" type="button" :aria-label="playing ? 'Pausar' : 'Ouvir'" @click="toggle">
      <Pause v-if="playing" :size="18" :stroke-width="2.4" fill="currentColor" />
      <Play v-else :size="18" :stroke-width="2.4" fill="currentColor" />
    </button>
    <div class="voice-body">
      <div class="voice-wave" role="slider" aria-label="Posição do áudio" :aria-valuenow="Math.round(progress * 100)" @click="seek">
        <i v-for="(p, i) in peaks" :key="i" :class="{ done: i / peaks.length < progress }" :style="{ height: `${Math.round(p * 100)}%` }" />
      </div>
      <div class="voice-foot">
        <span>{{ failed ? 'Não foi possível tocar' : timeLabel }}</span>
        <button v-if="playing || rate !== 1" class="voice-rate" type="button" @click="cycleRate">{{ String(rate).replace('.', ',') }}×</button>
      </div>
    </div>
    <audio
      ref="audio"
      :src="src"
      preload="metadata"
      @loadedmetadata="onMeta"
      @durationchange="onMeta"
      @timeupdate="current = audio?.currentTime ?? 0"
      @play="playing = true"
      @pause="playing = false"
      @ended="
        playing = false;
        current = 0;
      "
    />
  </div>
</template>
