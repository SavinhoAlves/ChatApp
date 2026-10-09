<script setup lang="ts">
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from '@lucide/vue';
import type { ComponentPublicInstance } from 'vue';

const c = useCall();
const { call, people, streams, local, muted, cameraOff, noMic, noCamera } = c;

const list = computed(() => Object.values(people.value));
const names = computed(() => list.value.map((p) => p.displayName.split(' ')[0]).join(', '));

// Cronômetro da chamada (mm:ss).
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
watch(
  () => call.value?.status,
  (s) => {
    clearInterval(tick);
    if (s === 'active') tick = setInterval(() => (now.value = Date.now()), 1000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(tick));

const elapsed = computed(() => {
  const start = call.value?.startedAt;
  if (!start) return '';
  const s = Math.max(0, Math.floor((now.value - start) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});

const statusText = computed(() => {
  const s = call.value;
  if (!s) return '';
  if (s.status === 'outgoing') return 'Chamando…';
  if (s.status === 'connecting') return 'Conectando…';
  if (s.status === 'active') return elapsed.value || 'Conectado';
  if (s.status === 'ended') {
    return s.endedReason === 'missed' ? 'Ninguém atendeu' : s.endedReason === 'declined' ? 'Chamada recusada' : 'Chamada encerrada';
  }
  return '';
});

// Liga cada <video>/<audio> ao stream certo (srcObject não é reativo no template).
function bindMedia(el: Element | ComponentPublicInstance | null, stream: MediaStream | null | undefined) {
  const media = el as HTMLMediaElement | null;
  if (media && stream && media.srcObject !== stream) media.srcObject = stream;
}

const hasVideo = (id: string) => !!streams.value[id]?.getVideoTracks().some((t) => t.readyState === 'live');
</script>

<template>
  <!-- Chamada recebida -->
  <div v-if="call && call.status === 'incoming'" class="call-incoming" role="alertdialog" aria-label="Chamada recebida">
    <Avatar :name="call.from?.displayName ?? '?'" :seed="call.from?.id ?? call.id" :size="64" :src="call.from?.avatarUrl" />
    <div class="call-incoming-text">
      <strong>{{ call.from?.displayName }}</strong>
      <small>{{ call.group ? 'Ligação em grupo' : call.video ? 'Chamada de vídeo' : 'Chamada de voz' }} recebida…</small>
    </div>
    <div class="call-incoming-actions">
      <button class="call-btn hangup" type="button" title="Recusar" aria-label="Recusar" @click="c.decline()">
        <PhoneOff :size="22" :stroke-width="2" />
      </button>
      <button v-if="call.video" class="call-btn accept" type="button" title="Atender com vídeo" aria-label="Atender com vídeo" @click="c.accept(true)">
        <Video :size="22" :stroke-width="2" />
      </button>
      <button class="call-btn accept" type="button" :title="call.video ? 'Atender só com voz' : 'Atender'" aria-label="Atender" @click="c.accept(false)">
        <Phone :size="22" :stroke-width="2" />
      </button>
    </div>
  </div>

  <!-- Chamando / em chamada / encerrada -->
  <div v-else-if="call" class="call-screen" :class="{ video: call.video }" role="dialog" aria-label="Ligação">
    <header class="call-top">
      <strong>{{ call.group || list.length > 1 ? 'Ligação em grupo' : (list[0]?.displayName ?? 'Ligação') }}</strong>
      <small>{{ call.group || list.length > 1 ? `${names} · ${statusText}` : statusText }}</small>
    </header>

    <div class="call-grid" :class="`n${Math.min(list.length, 4)}`">
      <div v-for="p in list" :key="p.id" class="call-tile">
        <video v-if="call.video && hasVideo(p.id)" :ref="(el) => bindMedia(el, streams[p.id])" autoplay playsinline />
        <template v-else>
          <!-- Só voz (ou câmera desligada): foto grande e o áudio tocando escondido. -->
          <Avatar :name="p.displayName" :seed="p.id" :size="list.length > 2 ? 88 : 132" :src="p.avatarUrl" />
          <audio v-if="streams[p.id]" :ref="(el) => bindMedia(el, streams[p.id])" autoplay />
        </template>
        <span class="call-tile-name">{{ p.displayName }}</span>
      </div>
    </div>

    <video v-if="call.video && local && !cameraOff" :ref="(el) => bindMedia(el, local)" class="call-self" autoplay playsinline muted />

    <p v-if="call.status !== 'ended' && (noMic || noCamera)" class="call-notice">
      {{ noMic ? 'Nenhum microfone encontrado: você está ouvindo, mas os outros não te escutam.' : 'Nenhuma câmera encontrada: você entrou só com voz.' }}
    </p>

    <footer v-if="call.status !== 'ended'" class="call-controls">
      <button class="call-btn" :class="{ off: muted }" type="button" :disabled="noMic" :aria-label="muted ? 'Ativar microfone' : 'Silenciar microfone'" @click="c.toggleMute()">
        <MicOff v-if="muted" :size="22" :stroke-width="2" />
        <Mic v-else :size="22" :stroke-width="2" />
      </button>
      <button v-if="call.video && !noCamera" class="call-btn" :class="{ off: cameraOff }" type="button" :aria-label="cameraOff ? 'Ligar câmera' : 'Desligar câmera'" @click="c.toggleCamera()">
        <VideoOff v-if="cameraOff" :size="22" :stroke-width="2" />
        <Video v-else :size="22" :stroke-width="2" />
      </button>
      <button class="call-btn hangup" type="button" aria-label="Desligar" @click="c.hangup()">
        <PhoneOff :size="22" :stroke-width="2" />
      </button>
    </footer>
  </div>
</template>
