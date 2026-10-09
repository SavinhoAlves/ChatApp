<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { formatListTime } from '~/utils/format';

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ close: [] }>();

const { api, me } = useAuth();
const chat = useChat();

type Result = { id: string; senderId: string; body: string; createdAt: string };
const query = ref('');
const results = ref<Result[]>([]);
const loading = ref(false);
const searched = ref(false);
const error = ref('');
const input = ref<HTMLInputElement | null>(null);
onMounted(() => nextTick(() => input.value?.focus()));

let debounce: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  clearTimeout(debounce);
  if (!q.trim()) {
    results.value = [];
    searched.value = false;
    return;
  }
  debounce = setTimeout(search, 300);
});
onBeforeUnmount(() => clearTimeout(debounce));
// Trocou de conversa: limpa a busca.
watch(
  () => props.conversationId,
  () => (query.value = ''),
);

async function search() {
  const q = query.value.trim();
  if (!q) return;
  loading.value = true;
  error.value = '';
  try {
    results.value = (await api<{ results: Result[] }>(`/conversations/${props.conversationId}/search`, { query: { q } })).results;
    searched.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

const conv = computed(() => chat.findConversation(props.conversationId));
const who = (r: Result) => (r.senderId === me.value?.id ? 'Você' : conv.value ? chat.userName(conv.value, r.senderId) : '');

/** Trecho com o termo destacado (texto escapado: nada de HTML vindo das mensagens). */
function highlight(body: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const q = query.value.trim();
  const i = body.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(body.slice(0, 120));
  const start = Math.max(0, i - 40);
  const pre = (start > 0 ? '…' : '') + body.slice(start, i);
  return `${esc(pre)}<mark>${esc(body.slice(i, i + q.length))}</mark>${esc(body.slice(i + q.length, i + q.length + 80))}`;
}

const open = (r: Result) => void chat.jumpToMessage(props.conversationId, r.id);
</script>

<template>
  <aside class="info-panel" aria-label="Pesquisar mensagens">
    <header class="info-head">
      <button class="icon-btn" type="button" aria-label="Fechar" @click="emit('close')"><X :size="20" :stroke-width="1.9" /></button>
      <h2>Pesquisar mensagens</h2>
    </header>
    <div class="side-search">
      <div class="field-icon">
        <Search :size="16" />
        <input ref="input" v-model="query" class="input" type="search" placeholder="Pesquisar…" aria-label="Pesquisar nesta conversa" />
      </div>
    </div>
    <div class="info-body search-results">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-else-if="!query.trim()" class="info-muted center">Pesquise mensagens nesta conversa.</p>
      <p v-else-if="loading" class="info-muted center">Pesquisando…</p>
      <p v-else-if="searched && !results.length" class="info-muted center">Nenhuma mensagem encontrada.</p>
      <button v-for="r in results" :key="r.id" class="search-hit" type="button" @click="open(r)">
        <span class="search-hit-top">
          <strong>{{ who(r) }}</strong>
          <time>{{ formatListTime(r.createdAt) }}</time>
        </span>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span class="search-hit-body" v-html="highlight(r.body)" />
      </button>
    </div>
  </aside>
</template>
