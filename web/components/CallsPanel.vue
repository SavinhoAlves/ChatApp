<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from '@lucide/vue';

// Aba Ligações: histórico de chamadas feitas e recebidas (perdidas em vermelho). Tocar no ícone liga de novo.
interface CallItem {
  id: string;
  video: boolean;
  conversationId: string | null;
  createdAt: string;
  direction: 'outgoing' | 'incoming';
  missed: boolean;
  durationSec: number;
  peers: { id: string; displayName: string; avatarUrl: string | null }[];
}

const { api } = useAuth();
const calls = useCall();
const items = ref<CallItem[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  try {
    items.value = (await api<{ calls: CallItem[] }>('/calls/history')).calls;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
// Acabou uma ligação: atualiza a lista.
watch(
  () => calls.call.value?.status,
  (s) => {
    if (s === 'ended' || !s) setTimeout(load, 800);
  },
);

const title = (c: CallItem) => (c.peers.length > 1 ? `${c.peers[0]!.displayName} e mais ${c.peers.length - 1}` : (c.peers[0]?.displayName ?? 'Ligação'));

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoje, ${time}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Ontem, ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`;
}

const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`);

async function callAgain(c: CallItem) {
  const target = c.conversationId ? { conversationId: c.conversationId } : { userIds: c.peers.map((p) => p.id) };
  await calls.startCall(target, c.video);
}
</script>

<template>
  <aside class="sidebar tab-panel">
    <header class="side-header">
      <div class="me brand-title"><strong>Ligações</strong></div>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ul v-if="items.length" class="conv-list call-list">
      <li v-for="c in items" :key="c.id" class="call-row">
        <Avatar :name="title(c)" :seed="c.peers[0]?.id ?? c.id" :size="48" :src="c.peers.length === 1 ? c.peers[0]!.avatarUrl : null" />
        <span class="call-info">
          <strong :class="{ missed: c.missed && c.direction === 'incoming' }">{{ title(c) }}</strong>
          <small :class="{ missed: c.missed }">
            <ArrowUpRight v-if="c.direction === 'outgoing'" :size="14" :stroke-width="2.4" />
            <ArrowDownLeft v-else :size="14" :stroke-width="2.4" />
            {{ when(c.createdAt) }}<template v-if="c.durationSec"> · {{ duration(c.durationSec) }}</template>
          </small>
        </span>
        <button class="icon-btn" type="button" :aria-label="c.video ? 'Chamada de vídeo' : 'Ligar'" @click="callAgain(c)">
          <Video v-if="c.video" :size="21" :stroke-width="1.8" />
          <Phone v-else :size="19" :stroke-width="1.8" />
        </button>
      </li>
    </ul>
    <div v-else-if="!loading" class="tab-empty">
      <span class="tab-empty-icon"><Phone :size="32" :stroke-width="1.7" /></span>
      <h2>Nenhuma ligação ainda</h2>
      <p>Ligue de dentro de uma conversa, pelo ícone de telefone ou de vídeo no topo.</p>
    </div>
  </aside>
</template>
