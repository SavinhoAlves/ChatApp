<script setup lang="ts">
import { Camera, Circle, RefreshCw, Square, Video, X } from '@lucide/vue';

const emit = defineEmits<{ close: []; captured: [blob: Blob, kind: 'IMAGE' | 'VIDEO'] }>();

const videoEl = ref<HTMLVideoElement | null>(null);
const mode = ref<'photo' | 'video'>('photo');
const facing = ref<'user' | 'environment'>('environment');
const recording = ref(false);
const recordingSeconds = ref(0);
const error = ref('');

let stream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let recordingTimer: ReturnType<typeof setInterval> | undefined;

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function openCamera() {
  stopStream();
  error.value = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Full HD a 30 fps (o aparelho usa o máximo que tiver até isso).
      video: { facingMode: facing.value, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: mode.value === 'video' ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
    });
  } catch {
    error.value = 'Não foi possível acessar a câmera.';
    return;
  }
  if (videoEl.value) videoEl.value.srcObject = stream;
}

function flipCamera() {
  facing.value = facing.value === 'environment' ? 'user' : 'environment';
}

watch([mode, facing], openCamera);
onMounted(openCamera);
onBeforeUnmount(() => {
  stopStream();
  clearInterval(recordingTimer);
});

function capturePhoto() {
  const video = videoEl.value;
  if (!video || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) emit('captured', blob, 'IMAGE');
  }, 'image/jpeg', 0.95);
}

function startRecording() {
  if (!stream) return;
  recordedChunks = [];
  // Vídeo gravado pelo app: 4 Mbps de vídeo e 128 kbps de áudio.
  mediaRecorder = new MediaRecorder(stream, { videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start();
  recording.value = true;
  recordingSeconds.value = 0;
  recordingTimer = setInterval(() => (recordingSeconds.value += 1), 1000);
}

function stopRecording() {
  if (!mediaRecorder) return;
  clearInterval(recordingTimer);
  const recorder = mediaRecorder;
  mediaRecorder = null;
  recording.value = false;
  recorder.addEventListener(
    'stop',
    () => {
      if (recordedChunks.length) emit('captured', new Blob(recordedChunks, { type: recorder.mimeType || 'video/webm' }), 'VIDEO');
    },
    { once: true },
  );
  recorder.stop();
}

function shoot() {
  if (mode.value === 'photo') capturePhoto();
  else if (recording.value) stopRecording();
  else startRecording();
}

const recordingLabel = computed(() => {
  const s = recordingSeconds.value;
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
});
</script>

<template>
  <div class="overlay camera-overlay">
    <div class="camera-dialog">
      <video ref="videoEl" class="camera-video" autoplay playsinline muted />

      <div v-if="error" class="camera-error">{{ error }}</div>

      <header class="camera-top">
        <button class="icon-btn camera-icon-btn" type="button" aria-label="Fechar câmera" @click="emit('close')">
          <X :size="22" :stroke-width="2" />
        </button>
        <span v-if="recording" class="rec-dot" aria-hidden="true" />
        <span v-if="recording" class="rec-time camera-rec-time">{{ recordingLabel }}</span>
        <button class="icon-btn camera-icon-btn" type="button" aria-label="Trocar câmera" :disabled="recording" @click="flipCamera">
          <RefreshCw :size="20" :stroke-width="2" />
        </button>
      </header>

      <footer class="camera-bottom">
        <div class="camera-modes" role="tablist">
          <button class="tab camera-mode-tab" :class="{ active: mode === 'photo' }" type="button" :disabled="recording" @click="mode = 'photo'">
            <Camera :size="15" :stroke-width="2" /> Foto
          </button>
          <button class="tab camera-mode-tab" :class="{ active: mode === 'video' }" type="button" :disabled="recording" @click="mode = 'video'">
            <Video :size="15" :stroke-width="2" /> Vídeo
          </button>
        </div>

        <button class="camera-shutter" type="button" :class="{ recording }" aria-label="Capturar" @click="shoot">
          <Square v-if="recording" :size="22" :stroke-width="0" fill="currentColor" />
          <Circle v-else :size="30" :stroke-width="0" fill="currentColor" />
        </button>
      </footer>
    </div>
  </div>
</template>
