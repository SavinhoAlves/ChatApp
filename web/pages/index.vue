<script setup lang="ts">
import { Plus, ShieldCheck } from '@lucide/vue';

const auth = useAuth();
const { me } = auth;
const { activeId, activeConversation, connect, loadConversations, loadArchived } = useChat();

const showNew = ref(false);
const newMode = ref<'direct' | 'group' | 'contact'>('direct');
const showSettings = ref(false);
// Painel da direita: dados do contato ou pesquisa na conversa.
const rightPanel = ref<'contact' | 'search' | null>(null);
const groupStartAdding = ref(false);

// Fechou a conversa: some o painel. Virou grupo: dados do contato não se aplicam.
watch(activeConversation, (c) => {
  if (!c) rightPanel.value = null;
  else if (c.type !== 'DIRECT' && rightPanel.value === 'contact') rightPanel.value = null;
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
  showSettings.value = false;
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
    showSettings.value = true;
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
}

onMounted(start);

useHead(() => ({ title: activeConversation.value ? `${activeConversation.value.title ?? 'Chat'} · Chat` : 'Chat' }));
</script>

<template>
  <div v-if="me" class="app" :class="{ 'chat-open': activeId, 'info-open': rightPanel && activeId }">
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
    <NewChatPanel v-else-if="showNew" :initial-view="newMode === 'direct' ? 'list' : newMode" @close="showNew = false" />
    <ConversationList v-else @new-chat="openNew" @settings="showSettings = true" />

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
        <h1>Chat</h1>
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

    <ContactInfoPanel v-if="rightPanel === 'contact' && activeId" :conversation-id="activeId" @close="rightPanel = null" />
    <SearchPanel v-else-if="rightPanel === 'search' && activeId" :conversation-id="activeId" @close="rightPanel = null" />
    <GroupInfoDialog v-if="showInfo && activeId" :conversation-id="activeId" :start-adding="groupStartAdding" @close="showInfo = false" />
    <CallOverlay />
  </div>

  <div v-else class="splash">
    <template v-if="failed">
      <p>Não foi possível conectar ao servidor.</p>
      <button class="btn btn-primary" type="button" @click="start">Tentar novamente</button>
    </template>
    <p v-else>Carregando…</p>
  </div>
</template>
