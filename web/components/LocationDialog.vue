<script setup lang="ts">
import { MapPin, Radio, X } from '@lucide/vue';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ close: [] }>();

const chat = useChat();

const busy = ref(false);
const error = ref('');

const durations = [
  { label: '15 minutos', minutes: 15 },
  { label: '1 hora', minutes: 60 },
  { label: '8 horas', minutes: 480 },
];

async function sendCurrent() {
  busy.value = true;
  error.value = '';
  try {
    await chat.sendCurrentLocation(props.conversationId);
    emit('close');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function sendLive(minutes: number) {
  busy.value = true;
  error.value = '';
  try {
    await chat.startLiveLocation(props.conversationId, minutes);
    emit('close');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Compartilhar localização">
      <header class="dialog-head">
        <h2>Compartilhar localização</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
          <X :size="18" :stroke-width="2" />
        </button>
      </header>

      <div class="dialog-body">
        <button class="user-item location-option" type="button" :disabled="busy" @click="sendCurrent">
          <span class="bubble-file-icon"><MapPin :size="18" :stroke-width="1.8" /></span>
          <span class="user-info">
            <strong>Localização atual</strong>
            <small>Envia sua posição uma única vez</small>
          </span>
        </button>

        <h3 class="section-title">Compartilhar em tempo real</h3>
        <button
          v-for="d in durations"
          :key="d.minutes"
          class="user-item location-option"
          type="button"
          :disabled="busy"
          @click="sendLive(d.minutes)"
        >
          <span class="bubble-file-icon live"><Radio :size="18" :stroke-width="1.8" /></span>
          <span class="user-info">
            <strong>{{ d.label }}</strong>
          </span>
        </button>

        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
