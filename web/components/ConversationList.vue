<script setup lang="ts">
import { Archive, Bell, Camera, CheckCheck, ChevronRight, CircleCheck, Ellipsis, Plus, Search, Trash2 } from '@lucide/vue';

const emit = defineEmits<{ 'new-chat': [mode: 'direct' | 'group' | 'contact']; camera: [] }>();

const { logout } = useAuth();
const { confirm } = useConfirm();
const { conversations, archivedConversations, activeId, online, connected, openConversation, conversationTitle, otherUser, isSelfChat, loadArchived } =
  useChat();

const search = ref('');

// ---- Selecionar conversas (menu ⋯): arquivar, marcar como lida ou apagar várias de uma vez ----
const selecting = useState('ui.selectingChats', () => false);
const selected = ref(new Set<string>());
const visibleIds = computed(() => (showArchived.value ? archivedConversations.value : filtered.value).map((c) => c.id));
const allSelected = computed(() => visibleIds.value.length > 0 && visibleIds.value.every((id) => selected.value.has(id)));
function startSelecting() {
  selected.value = new Set();
  selecting.value = true;
}
function stopSelecting() {
  selecting.value = false;
  selected.value = new Set();
}
function toggleSelected(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
function selectAll() {
  selected.value = allSelected.value ? new Set() : new Set(visibleIds.value);
}
async function bulk(action: 'archive' | 'read' | 'delete') {
  const chat = useChat();
  const ids = [...selected.value];
  if (action === 'delete') {
    const ok = await confirm({
      title: `Apagar ${ids.length} conversa${ids.length > 1 ? 's' : ''}?`,
      message: 'Elas somem da sua lista, mas voltam se chegar mensagem nova.',
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
  }
  for (const id of ids) {
    try {
      if (action === 'archive') await chat.setConversationPrefs(id, { archived: !showArchived.value });
      else if (action === 'read') {
        await chat.setConversationPrefs(id, { forcedUnread: false });
        chat.markRead(id);
      } else await chat.hideConversation(id);
    } catch {
      /* segue com as outras */
    }
  }
  stopSelecting();
}
onBeforeUnmount(stopSelecting);

// "Marcar todas como lidas" (menu ⋯)
const hasUnread = computed(() => conversations.value.some((c) => c.unreadCount > 0));
async function markAllRead() {
  const chat = useChat();
  for (const c of conversations.value) {
    if (c.unreadCount <= 0) continue;
    // "Marcar como não lida" também conta como não lida: desfaz e marca lida.
    await chat.setConversationPrefs(c.id, { forcedUnread: false }).catch(() => {});
    chat.markRead(c.id);
  }
}

// "conectando…" só depois de 3 s sem conexão: ao abrir o app a conexão leva um instante e o aviso só piscava.
const showReconnecting = ref(false);
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  connected,
  (ok) => {
    clearTimeout(reconnectTimer);
    if (ok) showReconnecting.value = false;
    else reconnectTimer = setTimeout(() => (showReconnecting.value = true), 3000);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(reconnectTimer));
const canNotify = ref(false);
const showDevices = ref(false);

// Menu "⋮" do topo, como no WhatsApp Web.
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);
function onDocClick(event: MouseEvent) {
  if (menuOpen.value && menuEl.value && !menuEl.value.contains(event.target as Node)) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

function menuAction(fn: () => void) {
  menuOpen.value = false;
  fn();
}

async function confirmLogout() {
  const ok = await confirm({ title: 'Desconectar?', message: 'Você vai sair da sua conta neste aparelho.', confirmLabel: 'Desconectar', danger: true });
  if (ok) await logout();
}
const showArchived = ref(false);

onMounted(() => {
  canNotify.value = typeof Notification !== 'undefined' && Notification.permission === 'default';
});

// No iPhone (PWA) a permissão só pode ser pedida a partir de um toque: por isso o botão.
const webPush = useWebPush();
async function enableNotifications() {
  const result = await webPush.enable().catch(() => 'default');
  canNotify.value = result === 'default';
}

// Filtros do topo, como no WhatsApp: Tudo, Não lidas, Favoritas, Grupos e as listas criadas por você.
const { lists, createList } = useLists();
const { prompt, alert } = useConfirm();
const filter = ref<string>('all');

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  let items = conversations.value;
  if (filter.value === 'unread') items = items.filter((c) => c.unreadCount > 0);
  else if (filter.value === 'favorites') items = items.filter((c) => c.favorited);
  else if (filter.value === 'groups') items = items.filter((c) => c.type === 'GROUP');
  else if (filter.value.startsWith('list:')) {
    const ids = new Set(lists.value.find((l) => `list:${l.id}` === filter.value)?.conversationIds ?? []);
    items = [...conversations.value, ...archivedConversations.value].filter((c) => ids.has(c.id));
  }
  if (!term) return items;
  return items.filter((c) => conversationTitle(c).toLowerCase().includes(term));
});

// A lista escolhida foi apagada: volta para "Tudo".
watch(lists, (all) => {
  if (filter.value.startsWith('list:') && !all.some((l) => `list:${l.id}` === filter.value)) filter.value = 'all';
});

async function newList() {
  const name = await prompt({ title: 'Nova lista', message: 'Depois, adicione conversas pelo menu ⋮ da conversa › Adicionar à lista.', placeholder: 'Ex.: Família, Trabalho', confirmLabel: 'Criar', maxLength: 40 });
  if (!name) return;
  try {
    const list = await createList(name);
    filter.value = `list:${list.id}`;
  } catch (e) {
    await alert((e as Error).message);
  }
}

const emptyText = computed(() => {
  if (search.value) return 'Nenhuma conversa encontrada.';
  if (filter.value === 'unread') return 'Nenhuma conversa não lida.';
  if (filter.value === 'favorites') return 'Nenhuma conversa favorita. Use ⋮ › Adicionar aos Favoritos.';
  if (filter.value === 'groups') return 'Você ainda não está em nenhum grupo.';
  if (filter.value.startsWith('list:')) return 'Lista vazia. Adicione conversas pelo menu ⋮ › Adicionar à lista.';
  return 'Nenhuma conversa ainda. Toque em + para começar.';
});

const isOnline = (conv: (typeof conversations.value)[number]) =>
  conv.type === 'DIRECT' && !isSelfChat(conv) && !!otherUser(conv) && !!online.value[otherUser(conv)!.id];

// Desarquivou a última: fecha a seção (o botão some junto).
watch(
  () => archivedConversations.value.length,
  (n) => {
    if (!n) showArchived.value = false;
  },
);

function toggleArchived() {
  showArchived.value = !showArchived.value;
  if (showArchived.value) void loadArchived();
}
</script>

<template>
  <aside class="sidebar">
    <!-- Como no WhatsApp: ⋯ à esquerda; câmera e nova conversa à direita; título e busca embaixo -->
    <header v-if="selecting" class="side-header list-top select-top">
      <button class="link-btn" type="button" @click="stopSelecting">Cancelar</button>
      <strong class="select-count">{{ selected.size ? `${selected.size} selecionada${selected.size > 1 ? 's' : ''}` : 'Selecionar' }}</strong>
      <button class="link-btn" type="button" @click="selectAll">{{ allSelected ? 'Nenhuma' : 'Todas' }}</button>
    </header>
    <header v-else class="side-header list-top">
      <div ref="menuEl" class="header-menu">
        <button
          class="icon-btn round-btn"
          type="button"
          title="Mais opções"
          aria-label="Mais opções"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <Ellipsis :size="20" :stroke-width="2" />
        </button>
        <div v-if="menuOpen" class="menu header-dropdown left" role="menu">
          <button class="menu-item" role="menuitem" type="button" @click="menuAction(startSelecting)">
            <CircleCheck :size="15" :stroke-width="2" /> Selecionar conversas
          </button>
          <button class="menu-item" role="menuitem" type="button" :disabled="!hasUnread" @click="menuAction(markAllRead)">
            <CheckCheck :size="15" :stroke-width="2" /> Marcar todas como lidas
          </button>
        </div>
      </div>
      <span class="list-top-gap" />
      <button class="icon-btn round-btn" type="button" title="Câmera" aria-label="Câmera" @click="emit('camera')">
        <Camera :size="19" :stroke-width="1.9" />
      </button>
      <button class="icon-btn round-btn accent" type="button" title="Nova conversa" aria-label="Nova conversa" @click="emit('new-chat', 'direct')">
        <Plus :size="20" :stroke-width="2.2" />
      </button>
    </header>

    <h1 class="list-title">
      Conversas
      <small v-if="showReconnecting" class="warn">conectando…</small>
    </h1>

    <div class="side-search">
      <div class="field-icon">
        <Search :size="16" :stroke-width="2" />
        <input v-model="search" class="input" type="search" placeholder="Buscar conversas" aria-label="Buscar conversas" />
      </div>
    </div>

    <nav class="filter-chips" aria-label="Filtros">
      <button class="chip-filter" :class="{ active: filter === 'all' }" type="button" @click="filter = 'all'">Tudo</button>
      <button class="chip-filter" :class="{ active: filter === 'unread' }" type="button" @click="filter = 'unread'">Não lidas</button>
      <button class="chip-filter" :class="{ active: filter === 'favorites' }" type="button" @click="filter = 'favorites'">Favoritas</button>
      <button class="chip-filter" :class="{ active: filter === 'groups' }" type="button" @click="filter = 'groups'">Grupos</button>
      <button
        v-for="l in lists"
        :key="l.id"
        class="chip-filter"
        :class="{ active: filter === `list:${l.id}` }"
        type="button"
        @click="filter = `list:${l.id}`"
      >
        {{ l.name }}
      </button>
      <button class="chip-filter add" type="button" title="Nova lista" aria-label="Nova lista" @click="newList"><Plus :size="14" :stroke-width="2.4" /></button>
    </nav>

    <button v-if="canNotify" class="notice" type="button" @click="enableNotifications">
      <Bell :size="16" :stroke-width="2" />
      Ativar notificações de novas mensagens
    </button>

    <button v-if="archivedConversations.length && filter === 'all'" class="archived-toggle" type="button" @click="toggleArchived">
      <Archive :size="16" :stroke-width="1.8" />
      <span>Arquivadas</span>
      <small class="archived-count">{{ archivedConversations.length }}</small>
      <ChevronRight :size="16" :stroke-width="2" class="archived-chevron" :class="{ open: showArchived }" />
    </button>

    <ul v-if="showArchived && archivedConversations.length && filter === 'all'" class="conv-list archived-list">
      <ConversationItem
        v-for="conv in archivedConversations"
        :key="conv.id"
        :conv="conv"
        :active="conv.id === activeId"
        :online="isOnline(conv)"
        :selecting="selecting"
        :selected="selected.has(conv.id)"
        @open="openConversation"
        @toggle="toggleSelected"
      />
      <li v-if="!archivedConversations.length" class="list-empty">Nenhuma conversa arquivada.</li>
    </ul>

    <ul class="conv-list">
      <ConversationItem
        v-for="conv in filtered"
        :key="conv.id"
        :conv="conv"
        :active="conv.id === activeId"
        :online="isOnline(conv)"
        :selecting="selecting"
        :selected="selected.has(conv.id)"
        @open="openConversation"
        @toggle="toggleSelected"
      />
      <li v-if="!filtered.length" class="list-empty">
        {{ emptyText }}
      </li>
    </ul>

    <div v-if="selecting" class="select-actions">
      <button type="button" :disabled="!selected.size" @click="bulk('archive')"><Archive :size="20" :stroke-width="1.9" /> {{ showArchived ? 'Desarquivar' : 'Arquivar' }}</button>
      <button type="button" :disabled="!selected.size" @click="bulk('read')"><CheckCheck :size="20" :stroke-width="1.9" /> Lida</button>
      <button type="button" class="danger" :disabled="!selected.size" @click="bulk('delete')"><Trash2 :size="20" :stroke-width="1.9" /> Apagar</button>
    </div>

    <DevicesDialog v-if="showDevices" @close="showDevices = false" />
  </aside>
</template>
