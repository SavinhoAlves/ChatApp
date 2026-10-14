<script setup lang="ts">
import { Archive, Bell, Camera, ChevronRight, EllipsisVertical, LogOut, MessageSquarePlus, Plus, Search, Settings, Smartphone, UserPlus, Users } from '@lucide/vue';

const emit = defineEmits<{ 'new-chat': [mode: 'direct' | 'group' | 'contact']; settings: []; camera: [] }>();

const { logout } = useAuth();
const { confirm } = useConfirm();
const { conversations, archivedConversations, activeId, online, connected, openConversation, conversationTitle, otherUser, isSelfChat, loadArchived } =
  useChat();

const search = ref('');
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
    <header class="side-header">
      <div class="me brand-title">
        <strong>Zynko</strong>
        <small v-if="!connected" class="warn">reconectando…</small>
      </div>
      <button class="icon-btn" type="button" title="Câmera" aria-label="Câmera" @click="emit('camera')">
        <Camera :size="21" :stroke-width="1.8" />
      </button>
      <button class="icon-btn hide-mobile" type="button" title="Nova conversa" aria-label="Nova conversa" @click="emit('new-chat', 'direct')">
        <Plus :size="20" :stroke-width="1.8" />
      </button>
      <div ref="menuEl" class="header-menu">
        <button
          class="icon-btn"
          type="button"
          title="Mais opções"
          aria-label="Mais opções"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <EllipsisVertical :size="20" :stroke-width="1.8" />
        </button>
        <div v-if="menuOpen" class="menu header-dropdown" role="menu">
          <button class="menu-item" role="menuitem" type="button" @click="menuAction(() => emit('new-chat', 'group'))">
            <Users :size="15" :stroke-width="2" /> Novo grupo
          </button>
          <button class="menu-item" role="menuitem" type="button" @click="menuAction(() => emit('new-chat', 'contact'))">
            <UserPlus :size="15" :stroke-width="2" /> Adicionar contato
          </button>
          <button class="menu-item" role="menuitem" type="button" @click="menuAction(() => (showDevices = true))">
            <Smartphone :size="15" :stroke-width="2" /> Dispositivos
          </button>
          <button class="menu-item" role="menuitem" type="button" @click="menuAction(() => emit('settings'))">
            <Settings :size="15" :stroke-width="2" /> Configurações
          </button>
          <button class="menu-item danger" role="menuitem" type="button" @click="menuAction(confirmLogout)">
            <LogOut :size="15" :stroke-width="2" /> Desconectar
          </button>
        </div>
      </div>
    </header>

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
        @open="openConversation"
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
        @open="openConversation"
      />
      <li v-if="!filtered.length" class="list-empty">
        {{ emptyText }}
      </li>
    </ul>

    <button class="fab" type="button" title="Nova conversa" aria-label="Nova conversa" @click="emit('new-chat', 'direct')">
      <MessageSquarePlus :size="24" :stroke-width="2" />
    </button>

    <DevicesDialog v-if="showDevices" @close="showDevices = false" />
  </aside>
</template>
