<script setup lang="ts">
import { Laptop, LogOut, Plus, Smartphone, X } from '@lucide/vue';
import type { Device } from '~/types';

const emit = defineEmits<{ close: [] }>();

const { api } = useAuth();
const { confirm } = useConfirm();

const devices = ref<Device[]>([]);
const loading = ref(true);
const error = ref('');
const scanning = ref(false);

async function load() {
  try {
    devices.value = (await api<{ devices: Device[] }>('/devices')).devices;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function revoke(device: Device) {
  const ok = await confirm({
    title: 'Desconectar dispositivo?',
    message: `${device.deviceName} será desconectado e precisará entrar de novo.`,
    confirmLabel: 'Desconectar',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/devices/${device.id}`, { method: 'DELETE' });
    devices.value = devices.value.filter((d) => d.id !== device.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function lastActive(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5 * 60_000) return 'ativo agora';
  return formatLastSeen(iso);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Dispositivos conectados">
      <header class="dialog-head">
        <h2>Dispositivos conectados</h2>
        <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
          <X :size="18" :stroke-width="2" />
        </button>
      </header>

      <div class="dialog-body">
        <button class="btn btn-primary btn-block" type="button" @click="scanning = true">
          <Plus :size="16" :stroke-width="2" /> Conectar dispositivo
        </button>
        <p class="dialog-hint">Escaneie o QR code da tela de login do computador para usar sua conta lá.</p>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <ul class="device-list">
          <li v-for="d in devices" :key="d.id" class="device-row">
            <component :is="d.platform === 'mobile' ? Smartphone : Laptop" :size="22" :stroke-width="1.6" />
            <div class="device-info">
              <strong>{{ d.deviceName }} <span v-if="d.current" class="tag">Este aparelho</span></strong>
              <small>{{ lastActive(d.lastActiveAt) }}</small>
            </div>
            <button
              v-if="!d.current"
              class="icon-btn"
              type="button"
              title="Desconectar"
              aria-label="Desconectar"
              @click="revoke(d)"
            >
              <LogOut :size="18" :stroke-width="1.8" />
            </button>
          </li>
          <li v-if="!loading && !devices.length" class="list-empty">Nenhum dispositivo.</li>
        </ul>
      </div>
    </div>
  </div>
  <QrScanDialog v-if="scanning" @close="scanning = false" @linked="load" />
</template>
