<script setup lang="ts">
import { Camera, Pencil, Plus } from '@lucide/vue';
import type { StatusAuthor } from '~/composables/useStatus';

// Aba Atualizações: Meu status (criar texto colorido ou foto/vídeo) e os status dos contatos (24 h).
const st = useStatus();
const { me } = useAuth();
const { alert } = useConfirm();
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const viewing = ref<{ author: StatusAuthor; mine: boolean } | null>(null);

const myAuthor = computed<StatusAuthor | null>(() =>
  me.value && st.mine.value.length
    ? { user: { id: me.value.id, displayName: me.value.displayName, avatarUrl: me.value.avatarUrl ?? null }, statuses: st.mine.value, allViewed: true }
    : null,
);
const recent = computed(() => st.others.value.filter((a) => !a.allViewed));
const seen = computed(() => st.others.value.filter((a) => a.allViewed));

onMounted(() => void st.load().catch(() => {}));
// Alguém publicou/apagou ou viu o meu: atualiza.
let socketBound = false;
watchEffect(() => {
  const socket = useChat().getSocket();
  if (socket && !socketBound) {
    socketBound = true;
    socket.on('status:changed', () => void st.load().catch(() => {}));
  }
});

// ---- Status de texto ----
const COLORS = ['#0f766e', '#7c3aed', '#be123c', '#c2410c', '#1d4ed8', '#15803d', '#334155'];
const composing = ref(false);
const text = ref('');
const color = ref(COLORS[0]!);
function nextColor() {
  color.value = COLORS[(COLORS.indexOf(color.value) + 1) % COLORS.length]!;
}
async function publishText() {
  if (!text.value.trim()) return;
  busy.value = true;
  try {
    await st.postText(text.value, color.value);
    composing.value = false;
    text.value = '';
  } catch (e) {
    await alert({ title: 'Não foi possível publicar', message: (e as Error).message });
  } finally {
    busy.value = false;
  }
}

// ---- Foto ou vídeo ----
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  busy.value = true;
  try {
    await st.postMedia(file, file.name);
  } catch (err) {
    await alert({ title: 'Não foi possível publicar', message: (err as Error).message });
  } finally {
    busy.value = false;
  }
}

function openMine() {
  if (myAuthor.value) viewing.value = { author: myAuthor.value, mine: true };
  else fileInput.value?.click();
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`;
};
// Anel dividido em tracinhos (um por status), como no WhatsApp: vistos em cinza, novos coloridos.
function ringStyle(items: { viewed?: boolean }[], allSeen = false) {
  const n = items.length;
  const color = (i: number) => (allSeen || items[i]!.viewed ? 'rgb(255 255 255 / 0.25)' : 'rgb(var(--accent-rgb))');
  if (n <= 1) return { background: color(0) };
  const gap = n > 12 ? 3 : 6;
  const seg = 360 / n;
  const stops = items.map((_, i) => {
    const a = i * seg + gap / 2;
    const b = (i + 1) * seg - gap / 2;
    return `transparent ${i * seg}deg ${a}deg, ${color(i)} ${a}deg ${b}deg, transparent ${b}deg ${(i + 1) * seg}deg`;
  });
  return { background: `conic-gradient(${stops.join(', ')})` };
}

const lastOf = (a: StatusAuthor) => a.statuses[a.statuses.length - 1]!.createdAt;
</script>

<template>
  <aside class="sidebar tab-panel">
    <header class="side-header">
      <div class="me brand-title"><strong>Atualizações</strong></div>
      <button class="icon-btn" type="button" aria-label="Status de texto" @click="composing = true"><Pencil :size="19" :stroke-width="1.9" /></button>
      <button class="icon-btn" type="button" aria-label="Status com foto ou vídeo" @click="fileInput?.click()"><Camera :size="20" :stroke-width="1.9" /></button>
    </header>

    <div class="status-list">
      <p class="section-label">Status</p>
      <button class="status-row" type="button" :disabled="busy" @click="openMine">
        <span class="status-ring" :class="{ none: !myAuthor }" :style="myAuthor ? ringStyle(myAuthor.statuses) : undefined">
          <Avatar v-if="me" :name="me.displayName" :seed="me.id" :size="50" :src="me.avatarUrl" />
          <span v-if="!myAuthor" class="status-add"><Plus :size="14" :stroke-width="3" /></span>
        </span>
        <span class="status-row-info">
          <strong>Meu status</strong>
          <small>{{ busy ? 'Publicando…' : myAuthor ? `${st.mine.value.length} atualização(ões) · ${ago(lastOf(myAuthor))}` : 'Toque para adicionar uma atualização' }}</small>
        </span>
      </button>

      <template v-if="recent.length">
        <p class="section-label">Recentes</p>
        <button v-for="a in recent" :key="a.user.id" class="status-row" type="button" @click="viewing = { author: a, mine: false }">
          <span class="status-ring" :style="ringStyle(a.statuses)"><Avatar :name="a.user.displayName" :seed="a.user.id" :size="50" :src="a.user.avatarUrl" /></span>
          <span class="status-row-info">
            <strong>{{ a.user.displayName }}</strong>
            <small>{{ ago(lastOf(a)) }}</small>
          </span>
        </button>
      </template>

      <template v-if="seen.length">
        <p class="section-label">Vistas</p>
        <button v-for="a in seen" :key="a.user.id" class="status-row" type="button" @click="viewing = { author: a, mine: false }">
          <span class="status-ring seen" :style="ringStyle(a.statuses, true)"><Avatar :name="a.user.displayName" :seed="a.user.id" :size="50" :src="a.user.avatarUrl" /></span>
          <span class="status-row-info">
            <strong>{{ a.user.displayName }}</strong>
            <small>{{ ago(lastOf(a)) }}</small>
          </span>
        </button>
      </template>

      <p v-if="st.loaded.value && !st.others.value.length" class="status-empty">
        Os status dos seus contatos aparecem aqui. Eles somem depois de 24 horas.
      </p>
    </div>

    <input ref="fileInput" type="file" accept="image/*,video/*" hidden @change="onFile" />

    <!-- Status de texto -->
    <div v-if="composing" class="status-compose" :style="{ background: color }">
      <header class="status-top">
        <button class="icon-btn" type="button" aria-label="Fechar" @click="composing = false">✕</button>
        <span class="status-who" />
        <button class="icon-btn status-color" type="button" aria-label="Trocar cor" @click="nextColor">🎨</button>
      </header>
      <textarea v-model="text" class="status-input" maxlength="700" placeholder="Digite um status" autofocus />
      <button class="send-btn status-send" type="button" :disabled="busy || !text.trim()" aria-label="Publicar" @click="publishText">➤</button>
    </div>

    <StatusViewer v-if="viewing" :author="viewing.author" :mine="viewing.mine" @close="viewing = null" />
  </aside>
</template>
