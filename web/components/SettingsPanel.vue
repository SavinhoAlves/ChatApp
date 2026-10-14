<script setup lang="ts">
import {
  ArrowLeft,
  AtSign,
  Bell,
  Camera,
  ChevronRight,
  CircleHelp,
  Keyboard,
  KeyRound,
  Lock,
  List,
  LogOut,
  MessageSquare,
  MonitorSmartphone,
  Pencil,
  Plus,
  Phone,
  Smartphone,
  Store,
  Trash2,
  UserX,
  Wallet,
} from '@lucide/vue';
import type { Component } from 'vue';
import type { User } from '~/types';
import { APP_COLORS, WALLPAPERS } from '~/composables/usePrefs';
import { formatPhone } from '~/utils/phone';

const emit = defineEmits<{ close: [] }>();

const auth = useAuth();
const { me } = auth;
const chat = useChat();
const { confirm, alert, prompt } = useConfirm();
const listsApi = useLists();

async function newList() {
  const name = await prompt({ title: 'Nova lista', placeholder: 'Ex.: Família, Trabalho', confirmLabel: 'Criar', maxLength: 40 });
  if (name) await run(async () => void (await listsApi.createList(name)));
}

async function renameList(id: string, current: string) {
  const name = await prompt({ title: 'Renomear lista', value: current, confirmLabel: 'Salvar', maxLength: 40 });
  if (name && name !== current) await run(() => listsApi.renameList(id, name));
}

async function removeList(id: string, name: string) {
  const ok = await confirm({ title: `Excluir a lista "${name}"?`, message: 'As conversas não são apagadas, só saem da lista.', confirmLabel: 'Excluir', danger: true });
  if (ok) await run(() => listsApi.deleteList(id));
}
const { prefs, setPref, wallpaperStyle } = usePrefs();

type View = 'main' | 'profile' | 'account' | 'business' | 'privacy' | 'chats' | 'lists' | 'notifications' | 'payments' | 'shortcuts' | 'help';
const view = ref<View>('main');

const titles: Record<View, string> = {
  main: 'Configurações',
  profile: 'Perfil',
  account: 'Conta',
  business: 'Conta comercial',
  privacy: 'Privacidade',
  chats: 'Conversas',
  lists: 'Listas',
  notifications: 'Notificações',
  payments: 'Pagamentos',
  shortcuts: 'Atalhos do teclado',
  help: 'Ajuda e feedback',
};

const items: { view: View; label: string; hint: string; icon: Component; desktopOnly?: boolean }[] = [
  { view: 'account', label: 'Conta', hint: 'Dispositivos conectados, seu número', icon: KeyRound },
  { view: 'business', label: 'Conta comercial', hint: 'Perfil da empresa: categoria, horário, endereço, site', icon: Store },
  { view: 'privacy', label: 'Privacidade', hint: 'Contatos bloqueados', icon: Lock },
  { view: 'chats', label: 'Conversas', hint: 'Cor do app, papel de parede, Enter para enviar', icon: MessageSquare },
  { view: 'lists', label: 'Listas', hint: 'Organize conversas: Família, Trabalho…', icon: List },
  { view: 'notifications', label: 'Notificações', hint: 'Avisos de novas mensagens', icon: Bell },
  { view: 'payments', label: 'Pagamentos', hint: 'Em breve', icon: Wallet },
  { view: 'shortcuts', label: 'Atalhos do teclado', hint: 'Ações rápidas', icon: Keyboard, desktopOnly: true },
  { view: 'help', label: 'Ajuda e feedback', hint: 'Dúvidas, sobre o app', icon: CircleHelp },
];

function back() {
  if (view.value === 'main') emit('close');
  else view.value = 'main';
}

const error = ref('');
async function run(fn: () => Promise<void>) {
  error.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

// ---- Perfil ----
const phone = ref<string | null>(null);
const editingName = ref(false);
const nameDraft = ref('');
const savingName = ref(false);
const photoInput = ref<HTMLInputElement | null>(null);
const photoBusy = ref(false);

async function loadMe() {
  const res = await auth.api<{ user: User }>('/me');
  phone.value = res.user.phone ?? null;
}

function startEditName() {
  nameDraft.value = me.value?.displayName ?? '';
  editingName.value = true;
}

async function saveName() {
  if (!nameDraft.value.trim()) return;
  savingName.value = true;
  await run(async () => {
    await auth.updateProfile({ displayName: nameDraft.value.trim() });
    editingName.value = false;
  });
  savingName.value = false;
}

async function changePhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  photoBusy.value = true;
  await run(() => auth.uploadAvatar(file));
  photoBusy.value = false;
}

async function removePhoto() {
  const ok = await confirm({ title: 'Remover foto?', message: 'Seus contatos voltarão a ver suas iniciais.', confirmLabel: 'Remover', danger: true });
  if (!ok) return;
  photoBusy.value = true;
  await run(() => auth.removeAvatar());
  photoBusy.value = false;
}

// ---- Conta ----
const showDevices = ref(false);

// Exigência da App Store: excluir a conta pelo próprio app. Pede para digitar EXCLUIR.
async function deleteMyAccount() {
  const typed = await prompt({
    title: 'Excluir minha conta',
    message:
      'Sua conta é apagada para sempre: conversas individuais (para você e para a outra pessoa), mensagens que você enviou em grupos, contatos e figurinhas. Não dá para desfazer. Digite EXCLUIR para confirmar.',
    placeholder: 'EXCLUIR',
    confirmLabel: 'Excluir conta',
    maxLength: 10,
  });
  if (typed === null) return;
  if (typed.toUpperCase() !== 'EXCLUIR') {
    await alert({ title: 'Conta mantida', message: 'O texto não confere. Para excluir, digite EXCLUIR.' });
    return;
  }
  await run(() => auth.deleteAccount());
}

async function logoutOthers() {
  const ok = await confirm({
    title: 'Desconectar outros aparelhos?',
    message: 'Todos os outros aparelhos conectados à sua conta vão precisar entrar de novo. Este continua conectado.',
    confirmLabel: 'Desconectar',
    danger: true,
  });
  if (!ok) return;
  await run(async () => {
    const res = await auth.api<{ revoked: number }>('/devices', { method: 'DELETE' });
    await alert({
      title: 'Pronto',
      message: res.revoked ? `${res.revoked} aparelho(s) desconectado(s).` : 'Não havia outros aparelhos conectados.',
    });
  });
}

// ---- Privacidade ----
const blocked = ref<User[]>([]);
const loadingBlocked = ref(false);

async function loadBlocked() {
  loadingBlocked.value = true;
  await run(async () => {
    blocked.value = (await auth.api<{ users: User[] }>('/contacts/blocked')).users;
  });
  loadingBlocked.value = false;
}

async function unblock(user: User) {
  await run(async () => {
    await chat.unblockUser(user.id);
    blocked.value = blocked.value.filter((u) => u.id !== user.id);
  });
}

// ---- Notificações ----
const permission = ref<NotificationPermission | 'unsupported'>('default');
function readPermission() {
  permission.value = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}
async function enableNotifications() {
  await Notification.requestPermission();
  readPermission();
}

watch(view, (v) => {
  error.value = '';
  editingName.value = false;
  if (v === 'profile' || v === 'account') void run(loadMe);
  if (v === 'privacy') void loadBlocked();
  if (v === 'notifications') readPermission();
});

// ---- Desconectar ----
async function logout() {
  const ok = await confirm({
    title: 'Desconectar?',
    message: 'Você vai sair da sua conta neste aparelho.',
    confirmLabel: 'Desconectar',
    danger: true,
  });
  if (ok) await auth.logout();
}

const isMac = import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform);
</script>

<template>
  <aside class="sidebar settings">
    <header class="settings-head">
      <button class="icon-btn" type="button" aria-label="Voltar" @click="back">
        <ArrowLeft :size="20" :stroke-width="1.9" />
      </button>
      <h2>{{ titles[view] }}</h2>
    </header>

    <div class="settings-body">
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- Lista principal -->
      <template v-if="view === 'main'">
        <button v-if="me" class="settings-profile" type="button" @click="view = 'profile'">
          <Avatar :name="me.displayName" :seed="me.id" :size="64" :src="me.avatarUrl" />
          <span class="settings-profile-info">
            <strong>{{ me.displayName }}</strong>
            <small>{{ me.isBusiness ? 'Conta comercial · ' : '' }}@{{ me.username }}</small>
          </span>
          <ChevronRight :size="18" :stroke-width="2" class="settings-chevron" />
        </button>

        <nav class="settings-list">
          <!-- Computadores conectados por QR code (o celular é a conta; não aparece aqui). -->
          <button class="settings-item" type="button" @click="showDevices = true">
            <MonitorSmartphone :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text">
              <strong>Dispositivos</strong>
              <small>Use o Zynko no computador lendo o QR code</small>
            </span>
          </button>
          <button v-for="item in items" :key="item.view" class="settings-item" :class="{ 'hide-mobile': item.desktopOnly }" type="button" @click="view = item.view">
            <component :is="item.icon" :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text">
              <strong>{{ item.label }}</strong>
              <small>{{ item.hint }}</small>
            </span>
          </button>
          <button class="settings-item danger" type="button" @click="logout">
            <LogOut :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text"><strong>Desconectar</strong></span>
          </button>
        </nav>
      </template>

      <!-- Perfil -->
      <template v-else-if="view === 'profile' && me">
        <div class="profile-photo">
          <button class="profile-photo-btn" type="button" :disabled="photoBusy" aria-label="Trocar foto" @click="photoInput?.click()">
            <Avatar :name="me.displayName" :seed="me.id" :size="160" :src="me.avatarUrl" />
            <span class="profile-photo-overlay"><Camera :size="26" :stroke-width="1.8" />{{ photoBusy ? 'Enviando…' : 'Trocar foto' }}</span>
          </button>
          <button v-if="me.avatarUrl" class="link-btn muted" type="button" :disabled="photoBusy" @click="removePhoto">
            <Trash2 :size="13" :stroke-width="2" class="inline-icon" /> Remover foto
          </button>
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="changePhoto" />
        </div>

        <section class="settings-field">
          <span class="settings-label">Nome</span>
          <form v-if="editingName" class="settings-inline-form" @submit.prevent="saveName">
            <input v-model="nameDraft" class="input" type="text" maxlength="40" autofocus aria-label="Seu nome" />
            <button class="btn btn-primary btn-sm" type="submit" :disabled="savingName || !nameDraft.trim()">Salvar</button>
          </form>
          <div v-else class="settings-value">
            <span>{{ me.displayName }}</span>
            <button class="icon-btn" type="button" aria-label="Editar nome" @click="startEditName"><Pencil :size="16" :stroke-width="1.9" /></button>
          </div>
          <small class="settings-note">É o nome que seus contatos veem.</small>
        </section>

        <section class="settings-field">
          <span class="settings-label">Nome de usuário</span>
          <div class="settings-value"><span><AtSign :size="14" :stroke-width="2" class="inline-icon" /> {{ me.username }}</span></div>
          <small class="settings-note">Também dá para te adicionarem por ele.</small>
        </section>

        <section class="settings-field">
          <span class="settings-label">Telefone</span>
          <div class="settings-value"><span><Phone :size="14" :stroke-width="2" class="inline-icon" /> {{ phone ? formatPhone(phone) : '—' }}</span></div>
        </section>
      </template>

      <!-- Conta -->
      <template v-else-if="view === 'account'">
        <section class="settings-field">
          <span class="settings-label">Seu número</span>
          <div class="settings-value"><span>{{ phone ? formatPhone(phone) : '—' }}</span></div>
        </section>
        <nav class="settings-list">
          <button class="settings-item" type="button" @click="showDevices = true">
            <Smartphone :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text">
              <strong>Dispositivos</strong>
              <small>Computadores conectados por QR code</small>
            </span>
          </button>
          <button class="settings-item danger" type="button" @click="logoutOthers">
            <LogOut :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text">
              <strong>Desconectar outros aparelhos</strong>
              <small>Mantém só este conectado</small>
            </span>
          </button>
          <button class="settings-item danger" type="button" @click="deleteMyAccount">
            <UserX :size="20" :stroke-width="1.8" class="settings-icon" />
            <span class="settings-text">
              <strong>Excluir minha conta</strong>
              <small>Apaga sua conta e seus dados para sempre</small>
            </span>
          </button>
        </nav>
      </template>

      <!-- Conta comercial -->
      <BusinessSettings v-else-if="view === 'business'" />

      <!-- Privacidade -->
      <template v-else-if="view === 'privacy'">
        <span class="settings-label">Contatos bloqueados</span>
        <ul class="settings-users">
          <li v-for="user in blocked" :key="user.id" class="device-row">
            <Avatar :name="user.displayName" :seed="user.id" :size="38" :src="user.avatarUrl" />
            <div class="device-info">
              <strong>{{ user.displayName }}</strong>
              <small>{{ user.phone ? formatPhone(user.phone) : `@${user.username}` }}</small>
            </div>
            <button class="btn btn-ghost btn-sm" type="button" @click="unblock(user)">Desbloquear</button>
          </li>
          <li v-if="!loadingBlocked && !blocked.length" class="list-empty">Você não bloqueou ninguém.</li>
        </ul>
        <small class="settings-note">Quem você bloqueia não consegue te mandar mensagens.</small>
      </template>

      <!-- Conversas -->
      <template v-else-if="view === 'chats'">
        <label class="settings-toggle">
          <span class="settings-text">
            <strong>Enter para enviar</strong>
            <small>Enter envia a mensagem; Shift+Enter quebra a linha. Desligado: Enter quebra a linha.</small>
          </span>
          <input type="checkbox" class="switch" :checked="prefs.enterToSend" @change="setPref('enterToSend', ($event.target as HTMLInputElement).checked)" />
        </label>

        <span class="settings-label">Cor do app</span>
        <div class="color-row">
          <button
            v-for="c in APP_COLORS"
            :key="c.id"
            type="button"
            class="color-dot labeled"
            :class="{ active: prefs.appColor === c.id }"
            :style="{ '--dot': `rgb(${c.rgb})` }"
            :aria-pressed="prefs.appColor === c.id"
            @click="setPref('appColor', c.id)"
          >
            <span>{{ c.label }}</span>
          </button>
        </div>

        <span class="settings-label">Papel de parede</span>
        <div class="wallpaper-grid">
          <button
            v-for="w in WALLPAPERS"
            :key="w.id"
            type="button"
            class="wallpaper-option wp"
            :class="{ active: prefs.wallpaper === w.id }"
            :style="wallpaperStyle(w.id)"
            :aria-pressed="prefs.wallpaper === w.id"
            @click="setPref('wallpaper', w.id)"
          >
            <span>{{ w.label }}</span>
          </button>
        </div>
        <small class="settings-note">Vale só para este aparelho.</small>
      </template>

      <!-- Listas -->
      <template v-else-if="view === 'lists'">
        <p class="settings-note">Listas aparecem como filtros no topo das conversas. Adicione conversas pelo menu ⋮ da conversa › Adicionar à lista.</p>
        <button class="btn btn-primary btn-block" type="button" @click="newList"><Plus :size="16" /> Nova lista</button>
        <ul class="settings-users">
          <li v-for="l in listsApi.lists.value" :key="l.id" class="device-row">
            <List :size="20" :stroke-width="1.8" />
            <div class="device-info">
              <strong>{{ l.name }}</strong>
              <small>{{ l.conversationIds.length }} {{ l.conversationIds.length === 1 ? 'conversa' : 'conversas' }}</small>
            </div>
            <button class="icon-btn" type="button" aria-label="Renomear" @click="renameList(l.id, l.name)"><Pencil :size="16" /></button>
            <button class="icon-btn" type="button" aria-label="Excluir" @click="removeList(l.id, l.name)"><Trash2 :size="16" /></button>
          </li>
          <li v-if="!listsApi.lists.value.length" class="list-empty">Você ainda não criou nenhuma lista.</li>
        </ul>
      </template>

      <!-- Notificações -->
      <template v-else-if="view === 'notifications'">
        <section class="settings-field">
          <span class="settings-label">Notificações deste navegador</span>
          <div class="settings-value">
            <span v-if="permission === 'granted'">Ativadas</span>
            <span v-else-if="permission === 'denied'">Bloqueadas</span>
            <span v-else-if="permission === 'unsupported'">Não suportadas neste navegador</span>
            <span v-else>Desativadas</span>
            <button v-if="permission === 'default'" class="btn btn-primary btn-sm" type="button" @click="enableNotifications">Ativar</button>
          </div>
          <small v-if="permission === 'denied'" class="settings-note">
            Para liberar, clique no cadeado ao lado do endereço do site e permita notificações.
          </small>
          <small v-else class="settings-note">Avisa novas mensagens quando o Zynko está aberto em segundo plano.</small>
        </section>
      </template>

      <!-- Pagamentos -->
      <template v-else-if="view === 'payments'">
        <div class="settings-soon">
          <Wallet :size="40" :stroke-width="1.4" />
          <strong>Em breve</strong>
          <p>Pagamentos ainda não estão disponíveis no Zynko.</p>
        </div>
      </template>

      <!-- Atalhos -->
      <template v-else-if="view === 'shortcuts'">
        <ul class="shortcut-list">
          <li><span>Enviar mensagem</span><kbd>Enter</kbd></li>
          <li><span>Quebrar linha</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd></span></li>
          <li><span>Cancelar resposta ou edição</span><kbd>Esc</kbd></li>
          <li><span>Fechar janela aberta</span><kbd>Esc</kbd></li>
          <li><span>Nova conversa</span><span><kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd> + <kbd>Alt</kbd> + <kbd>N</kbd></span></li>
          <li><span>Configurações</span><span><kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd> + <kbd>Alt</kbd> + <kbd>,</kbd></span></li>
        </ul>
      </template>

      <!-- Ajuda -->
      <template v-else-if="view === 'help'">
        <section class="settings-help">
          <h3>Como conectar o computador</h3>
          <p>No computador, abra o Zynko: aparece um QR code. No celular, vá em Configurações › Conta › Dispositivos conectados › Conectar dispositivo e aponte a câmera.</p>
          <h3>Como adicionar alguém</h3>
          <p>Toque em + e digite o número da pessoa, ou importe da agenda (Chrome do Android).</p>
          <h3>Recebi mensagem de um número desconhecido</h3>
          <p>No topo da conversa aparecem as opções Bloquear e Adicionar.</p>
          <h3>Problemas ou sugestões</h3>
          <p>Fale com quem administra este servidor do Zynko.</p>
          <small class="settings-note">Zynko · versão 0.1.0</small>
        </section>
      </template>
    </div>

    <DevicesDialog v-if="showDevices" @close="showDevices = false" />
  </aside>
</template>
