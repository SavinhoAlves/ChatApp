<script setup lang="ts">
import { CircleDashed, MessageCircle, Phone, Plus, Settings, ShieldCheck, UsersRound } from '@lucide/vue';

const auth = useAuth();
const { me } = auth;
const { activeId, activeConversation, connect, loadConversations, loadArchived, conversationTitle, conversations } = useChat();

const showNew = ref(false);
const newMode = ref<'direct' | 'group' | 'contact'>('direct');
// Abas do app (celular): Atualizações, Ligações, Comunidades, Conversas e Configurações.
type Tab = 'updates' | 'calls' | 'communities' | 'chats' | 'settings';
const tab = ref<Tab>('chats');
// Painel da direita: dados do contato ou pesquisa na conversa.
const selectingChats = useState('ui.selectingChats', () => false);
const rightPanel = ref<'contact' | 'search' | null>(null);
const groupStartAdding = ref(false);

// Fechou a conversa: some o painel. Virou grupo: dados do contato não se aplicam.
watch(activeConversation, (c) => {
  if (!c) rightPanel.value = null;
  else if (c.type !== 'DIRECT' && rightPanel.value === 'contact') rightPanel.value = null;
});

// "Mais" › Dados do grupo/contato (da lista): abre a conversa e em seguida os dados.
const infoFor = useState<string | null>('ui.infoFor', () => null);
watch([infoFor, activeId], ([id, active]) => {
  if (!id || id !== active) return;
  infoFor.value = null;
  if (activeConversation.value?.type === 'GROUP') openGroupInfo();
  else rightPanel.value = 'contact';
});

function openGroupInfo(adding = false) {
  groupStartAdding.value = adding;
  showInfo.value = true;
}

// Entrou por link de ligação (/?call=ID): entra na chamada assim que o socket conectar.
const route = useRoute();
const calls = useCall();
async function joinFromLink() {
  const id = typeof route.query.call === 'string' ? route.query.call : null;
  if (!id) return;
  await navigateTo({ query: {} }, { replace: true });
  const socket = useChat().getSocket();
  for (let i = 0; i < 50 && !socket?.connected; i++) await new Promise((r) => setTimeout(r, 100));
  await calls.join(id, true);
}
watch(() => route.query.call, () => void joinFromLink());

function openNew(mode: 'direct' | 'group' | 'contact' = 'direct') {
  newMode.value = mode;
  tab.value = 'chats';
  showNew.value = true;
}

// Atalhos globais (listados em Configurações › Atalhos do teclado).
function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || !event.altKey) return;
  if (event.code === 'KeyN') {
    event.preventDefault();
    openNew('direct');
  } else if (event.code === 'Comma') {
    event.preventDefault();
    showNew.value = false;
    tab.value = 'settings';
  }
}
onMounted(() => window.addEventListener('keydown', onShortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut));
const showInfo = ref(false);
const failed = ref(false);

async function start() {
  failed.value = false;
  const ok = await auth.restore();
  if (!ok) {
    // Sem token válido o middleware já leva ao login; aqui só sobra "sem conexão".
    failed.value = !!auth.token.value;
    return;
  }
  connect();
  try {
    await loadConversations();
  } catch {
    /* o socket recarrega a lista ao conectar */
  }
  // Para saber se mostra "Arquivadas" (só aparece quando há alguma).
  void loadArchived().catch(() => {});
  void useLists().loadLists().catch(() => {});
  void joinFromLink();
  // Web Push: permissão já dada antes → renova a inscrição deste aparelho (sem perguntar de novo).
  void useWebPush().subscribe().catch(() => {});
  void openFromQuery();
}

// Tocou numa notificação (Web Push): abre a conversa (?c=ID ao abrir, ou mensagem do service worker).
async function openFromQuery() {
  const id = typeof route.query.c === 'string' ? route.query.c : null;
  if (!id) return;
  await navigateTo({ query: {} }, { replace: true });
  for (let i = 0; i < 50 && !conversations.value.some((c) => c.id === id); i++) await new Promise((r) => setTimeout(r, 100));
  await useChat().openConversation(id).catch(() => {});
}
function onSwMessage(e: MessageEvent) {
  if (e.data?.type === 'open-conversation' && typeof e.data.conversationId === 'string') {
    tab.value = 'chats';
    void useChat().openConversation(e.data.conversationId).catch(() => {});
  }
}
onMounted(() => navigator.serviceWorker?.addEventListener('message', onSwMessage));
onBeforeUnmount(() => navigator.serviceWorker?.removeEventListener('message', onSwMessage));

onMounted(start);

// Celular (fora de uma conversa): barra de abas embaixo, como num app. Layout varia por plataforma.
const platform = uiPlatform();
const unreadTotal = computed(() => conversations.value.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0));

// Número no ícone do app (fora dele) acompanha as mensagens não lidas enquanto o app está aberto.
const unreadMessages = computed(() => conversations.value.reduce((n, c) => n + (c.mutedUntil ? 0 : c.unreadCount), 0));
watch(unreadMessages, (n) => {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (n > 0) void nav.setAppBadge?.(n).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
});
function goTab(t: Tab) {
  tab.value = t;
  showNew.value = false;
}

// Câmera do topo: tira a foto/vídeo e escolhe para quem enviar (como no WhatsApp).
const showCamera = ref(false);
const captured = ref<{ blob: Blob; kind: 'IMAGE' | 'VIDEO' } | null>(null);
function onCaptured(blob: Blob, kind: 'IMAGE' | 'VIDEO') {
  showCamera.value = false;
  captured.value = { blob, kind };
}
async function sendCaptured(ids: string[]) {
  const shot = captured.value;
  captured.value = null;
  if (!shot) return;
  try {
    const name = shot.kind === 'IMAGE' ? `foto-${Date.now()}.jpg` : `video-${Date.now()}.webm`;
    const attachment = await auth.upload(shot.blob, name);
    for (const id of ids) useChat().send(id, '', null, attachment);
    if (ids.length === 1) void useChat().openConversation(ids[0]!);
  } catch (e) {
    await useConfirm().alert({ title: 'Não foi possível enviar', message: (e as Error).message });
  }
}

useHead(() => ({ title: activeConversation.value ? `${conversationTitle(activeConversation.value)} · Zynko` : 'Zynko' }));
</script>

<template>
  <div v-if="me" class="app" :class="{ 'chat-open': activeId, 'info-open': rightPanel && activeId }">
    <SettingsPanel v-if="tab === 'settings'" @close="tab = 'chats'" />
    <StatusPanel v-else-if="tab === 'updates'" />
    <CallsPanel v-else-if="tab === 'calls'" />
    <CommunitiesPanel v-else-if="tab === 'communities'" />
    <NewChatPanel v-else-if="showNew" :initial-view="newMode === 'direct' ? 'list' : newMode" @close="showNew = false" />
    <ConversationList v-else @new-chat="openNew" @settings="tab = 'settings'" @camera="showCamera = true" />

    <ChatWindow
      v-if="activeId"
      @info="openGroupInfo()"
      @add-member="openGroupInfo(true)"
      @contact-info="rightPanel = rightPanel === 'contact' ? null : 'contact'"
      @search="rightPanel = 'search'"
    />
    <section v-else class="main empty-state">
      <div class="welcome">
        <img class="welcome-logo" src="/logo.png" alt="" width="148" height="148" />
        <h1>Zynko</h1>
        <p class="welcome-text">
          Envie mensagens, fotos, vídeos, áudios e localização em tempo real. Escolha uma conversa ao lado ou comece
          uma nova para começar a conversar.
        </p>
        <button class="btn btn-primary" type="button" @click="openNew('direct')">
          <Plus :size="16" :stroke-width="2.2" /> Nova conversa
        </button>
        <div class="welcome-divider" />
        <p class="welcome-footer">
          <ShieldCheck :size="14" :stroke-width="2" />
          Suas mensagens ficam só no seu próprio servidor
        </p>
      </div>
    </section>

    <ContactInfoPanel v-if="rightPanel === 'contact' && activeId" :conversation-id="activeId" @close="rightPanel = null" @search="rightPanel = 'search'" />
    <SearchPanel v-else-if="rightPanel === 'search' && activeId" :conversation-id="activeId" @close="rightPanel = null" />
    <GroupInfoDialog v-if="showInfo && activeId" :conversation-id="activeId" :start-adding="groupStartAdding" @close="showInfo = false" />
    <CallOverlay />

    <nav v-if="!activeId && !selectingChats" class="tabbar" aria-label="Navegação">
      <button type="button" :class="{ active: tab === 'updates' }" @click="goTab('updates')">
        <span class="tabbar-icon"><CircleDashed :size="22" :stroke-width="1.9" /></span>
        Atualizações
      </button>
      <button type="button" :class="{ active: tab === 'calls' }" @click="goTab('calls')">
        <span class="tabbar-icon"><Phone :size="21" :stroke-width="1.9" /></span>
        Ligações
      </button>
      <button type="button" :class="{ active: tab === 'communities' }" @click="goTab('communities')">
        <span class="tabbar-icon"><UsersRound :size="22" :stroke-width="1.9" /></span>
        Comunidades
      </button>
      <button type="button" :class="{ active: tab === 'chats' }" @click="goTab('chats')">
        <span class="tabbar-icon">
          <MessageCircle :size="22" :stroke-width="1.9" /><span v-if="unreadTotal" class="tabbar-badge">{{ unreadTotal }}</span>
        </span>
        Conversas
      </button>
      <!-- Aba "Você" com a foto de perfil (abre Configurações), no iPhone e no Android. -->
      <button type="button" class="tab-settings" :class="{ active: tab === 'settings' }" @click="goTab('settings')">
        <span class="tabbar-icon">
          <Avatar class="tab-avatar" :name="me.displayName" :seed="me.id" :size="24" :src="me.avatarUrl" />
        </span>
        Você
      </button>
    </nav>
    <CameraDialog v-if="showCamera" @close="showCamera = false" @captured="onCaptured" />
    <SendToDialog v-if="captured" @close="captured = null" @pick="sendCaptured" />
  </div>

  <div v-else class="splash">
    <template v-if="failed">
      <p>Não foi possível conectar ao servidor.</p>
      <button class="btn btn-primary" type="button" @click="start">Tentar novamente</button>
    </template>
    <p v-else>Carregando…</p>
  </div>
</template>
