<script setup lang="ts">
import { Check, Laptop, X } from '@lucide/vue';
import jsQR from 'jsqr';

const emit = defineEmits<{ close: []; linked: [] }>();

const { api } = useAuth();

const videoEl = ref<HTMLVideoElement | null>(null);
const error = ref('');
const loading = ref(false);
const done = ref(false);
const manual = ref('');
// Depois de ler um QR válido, pedimos confirmação mostrando de qual aparelho é o pedido.
const pending = ref<{ code: string; deviceName: string; platform: string } | null>(null);

let stream: MediaStream | null = null;
let raf = 0;
let canvas: HTMLCanvasElement | null = null;

function stopCamera() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function preview(code: string) {
  loading.value = true;
  error.value = '';
  try {
    const info = await api<{ deviceName: string; platform: string }>('/auth/qr/preview', { method: 'POST', body: { code } });
    pending.value = { code, ...info };
    stopCamera();
  } catch (e) {
    error.value = (e as Error).message;
    // Permite tentar outro QR: o loop de leitura continua.
    lastRejected = code;
  } finally {
    loading.value = false;
  }
}

let lastRejected = '';

function scan() {
  const video = videoEl.value;
  if (!video || pending.value) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth && !loading.value) {
    canvas ??= document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (result?.data && result.data !== lastRejected) {
        void preview(result.data);
      }
    }
  }
  raf = requestAnimationFrame(scan);
}

onMounted(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    error.value = 'Não foi possível acessar a câmera. Cole o código abaixo.';
    return;
  }
  if (videoEl.value) {
    videoEl.value.srcObject = stream;
    await videoEl.value.play().catch(() => {});
    raf = requestAnimationFrame(scan);
  }
});
onBeforeUnmount(stopCamera);

async function approve() {
  if (!pending.value) return;
  loading.value = true;
  error.value = '';
  try {
    await api('/auth/qr/approve', { method: 'POST', body: { code: pending.value.code } });
    done.value = true;
    emit('linked');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

function cancelPending() {
  pending.value = null;
  error.value = '';
  lastRejected = '';
  emit('close');
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Conectar dispositivo">
      <header class="dialog-head">
        <h2>Conectar dispositivo</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
          <X :size="18" :stroke-width="2" />
        </button>
      </header>

      <div class="dialog-body">
        <template v-if="done">
          <div class="notice"><Check :size="16" :stroke-width="2" /> Dispositivo conectado. Já pode usar o Chat nele.</div>
          <button class="btn btn-primary btn-block" type="button" @click="emit('close')">Concluir</button>
        </template>

        <template v-else-if="pending">
          <div class="device-confirm">
            <Laptop :size="40" :stroke-width="1.5" />
            <strong>{{ pending.deviceName }}</strong>
            <p class="dialog-hint">Quer entrar na sua conta. Só confirme se foi você que abriu o QR code agora.</p>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button class="btn btn-primary btn-block" type="button" :disabled="loading" @click="approve">
            {{ loading ? 'Conectando…' : 'Conectar' }}
          </button>
          <button class="btn btn-ghost btn-block" type="button" @click="cancelPending">Cancelar</button>
        </template>

        <template v-else>
          <p class="dialog-hint">Aponte a câmera para o QR code que aparece na tela de login do computador.</p>
          <div class="scan-box"><video ref="videoEl" playsinline muted /></div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <form class="manual" @submit.prevent="preview(manual.trim())">
            <input v-model="manual" class="input" type="text" placeholder="Ou cole o código do QR" autocomplete="off" spellcheck="false" />
            <button class="btn btn-ghost" type="submit" :disabled="loading || !manual.trim()">Usar</button>
          </form>
        </template>
      </div>
    </div>
  </div>
</template>
