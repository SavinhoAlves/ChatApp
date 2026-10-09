<script setup lang="ts">
import {
  Ban,
  Bell,
  BellOff,
  ChevronRight,
  CircleX,
  Download,
  EllipsisVertical,
  Flag,
  Heart,
  Info,
  Link,
  ListPlus,
  LogOut,
  MinusCircle,
  Palette,
  Plus,
  Search,
  SquareCheck,
  Timer,
  Trash2,
  UserPlus,
  UsersRound,
  Check,
} from '@lucide/vue';
import type { Conversation } from '~/types';

const props = defineProps<{ conv: Conversation }>();
const emit = defineEmits<{
  info: [];
  search: [];
  select: [];
  disappearing: [];
  theme: [];
  report: [];
  'add-member': [];
  'group-call': [];
}>();

const { me, token } = useAuth();
const chat = useChat();
const calls = useCall();
const { lists, loaded, loadLists, toggleInList, createList } = useLists();
const { confirm, alert, prompt } = useConfirm();

const open = ref(false);
const sub = ref<'mute' | 'lists' | null>(null);
const root = ref<HTMLElement | null>(null);

const isGroup = computed(() => props.conv.type === 'GROUP');
const isSelf = computed(() => chat.isSelfChat(props.conv));
const isAdmin = computed(() => props.conv.participants.find((p) => p.userId === me.value?.id)?.role === 'ADMIN');
const peer = computed(() => (isGroup.value ? null : chat.otherUser(props.conv)));
const isMuted = computed(() => !!props.conv.mutedUntil && new Date(props.conv.mutedUntil).getTime() > Date.now());
const mutedForever = computed(() => isMuted.value && new Date(props.conv.mutedUntil!).getFullYear() - new Date().getFullYear() > 5);
const mutedUntilText = computed(() => {
  if (!isMuted.value) return '';
  if (mutedForever.value) return 'Sempre silenciadas';
  return `Silenciadas até ${new Date(props.conv.mutedUntil!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
});

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close();
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

function close() {
  open.value = false;
  sub.value = null;
}

function toggle() {
  open.value = !open.value;
  sub.value = null;
  if (open.value && !loaded.value) void loadLists().catch(() => {});
}

async function run(fn: () => unknown) {
  close();
  try {
    await fn();
  } catch (e) {
    await alert((e as Error).message);
  }
}

type MenuEvent = 'info' | 'search' | 'select' | 'disappearing' | 'theme' | 'report' | 'add-member' | 'group-call';
function say(ev: MenuEvent) {
  close();
  (emit as (event: MenuEvent) => void)(ev);
}

// Silenciar por um tempo (como no WhatsApp: 8 horas, 1 semana, sempre).
const MUTE_OPTIONS = [
  { label: '8 horas', minutes: 8 * 60 },
  { label: '1 semana', minutes: 7 * 24 * 60 },
  { label: 'Sempre', minutes: 10 * 365 * 24 * 60 },
];
const mute = (minutes: number | null) => run(() => chat.setConversationPrefs(props.conv.id, { muteMinutes: minutes }));

const toggleFavorite = () => run(() => chat.setConversationPrefs(props.conv.id, { favorited: !props.conv.favorited }));

async function newListWithThis() {
  close();
  const name = await prompt({ title: 'Nova lista', placeholder: 'Ex.: Família, Trabalho', confirmLabel: 'Criar', maxLength: 40 });
  if (!name) return;
  try {
    await createList(name, [props.conv.id]);
  } catch (e) {
    await alert((e as Error).message);
  }
}

async function exportChat() {
  close();
  try {
    const res = await fetch(`/api/conversations/${props.conv.id}/export`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (!res.ok) throw new Error('Não foi possível exportar a conversa');
    const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'conversa.txt');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    await alert((e as Error).message);
  }
}

const closeChat = () => run(() => chat.closeConversation());
const sendLink = () => run(() => calls.sendCallLink(props.conv.id, true));

async function toggleBlock() {
  close();
  const user = peer.value;
  if (!user) return;
  if (props.conv.youBlocked) return run(() => chat.unblockUser(user.id, props.conv.id));
  const ok = await confirm({ title: `Bloquear ${user.displayName}?`, message: 'Essa pessoa não poderá mais te mandar mensagens nem te ligar.', confirmLabel: 'Bloquear', danger: true });
  if (ok) await run(() => chat.blockUser(user.id, props.conv.id));
}

async function clearChat() {
  close();
  const ok = await confirm({ title: 'Limpar esta conversa?', message: 'As mensagens somem só para você.', confirmLabel: 'Limpar', danger: true });
  if (ok) await run(() => chat.clearConversationHistory(props.conv.id));
}

async function deleteChat() {
  close();
  const ok = await confirm({ title: 'Apagar esta conversa?', message: 'Ela some da sua lista, mas volta se chegar mensagem nova.', confirmLabel: 'Apagar', danger: true });
  if (ok) await run(() => chat.hideConversation(props.conv.id));
}

async function leaveGroup() {
  close();
  const ok = await confirm({ title: 'Sair do grupo?', message: 'Você não vai mais receber mensagens deste grupo.', confirmLabel: 'Sair', danger: true });
  if (ok) await run(() => chat.removeMember(props.conv.id, me.value!.id));
}
</script>

<template>
  <div ref="root" class="chat-menu">
    <button class="icon-btn" type="button" title="Mais opções" aria-label="Mais opções" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <EllipsisVertical :size="20" :stroke-width="1.9" />
    </button>

    <div v-if="open" class="menu chat-menu-list" role="menu">
      <!-- Grupo -->
      <button v-if="isGroup && isAdmin" class="menu-item" role="menuitem" type="button" @click="say('add-member')"><UserPlus :size="17" /> Adicionar membro</button>
      <button class="menu-item" role="menuitem" type="button" @click="say('info')">
        <Info :size="17" /> {{ isGroup ? 'Dados do grupo' : 'Dados do contato' }}
      </button>
      <button class="menu-item" role="menuitem" type="button" @click="say('search')"><Search :size="17" /> Pesquisar</button>
      <button class="menu-item" role="menuitem" type="button" @click="say('select')"><SquareCheck :size="17" /> Selecionar mensagens</button>

      <div class="menu-sub-anchor">
        <button v-if="isMuted" class="menu-item" role="menuitem" type="button" @click="mute(null)">
          <Bell :size="17" />
          <span class="menu-item-text">Reativar notificações<small>{{ mutedUntilText }}</small></span>
        </button>
        <button v-else class="menu-item has-sub" role="menuitem" type="button" aria-haspopup="menu" @click="sub = sub === 'mute' ? null : 'mute'">
          <BellOff :size="17" /> Silenciar notificações <ChevronRight :size="15" class="menu-chevron" />
        </button>
        <div v-if="sub === 'mute' && !isMuted" class="menu menu-sub" role="menu">
          <button v-for="o in MUTE_OPTIONS" :key="o.label" class="menu-item" role="menuitem" type="button" @click="mute(o.minutes)">{{ o.label }}</button>
        </div>
      </div>

      <button class="menu-item" role="menuitem" type="button" @click="say('disappearing')">
        <Timer :size="17" />
        <span class="menu-item-text">Mensagens temporárias<small v-if="conv.disappearSeconds">Ativadas</small></span>
      </button>
      <button class="menu-item" role="menuitem" type="button" @click="say('theme')"><Palette :size="17" /> Tema da conversa</button>
      <button class="menu-item" role="menuitem" type="button" @click="toggleFavorite">
        <Heart :size="17" :fill="conv.favorited ? 'currentColor' : 'none'" /> {{ conv.favorited ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos' }}
      </button>

      <div class="menu-sub-anchor">
        <button class="menu-item has-sub" role="menuitem" type="button" aria-haspopup="menu" @click="sub = sub === 'lists' ? null : 'lists'">
          <ListPlus :size="17" /> Adicionar à lista <ChevronRight :size="15" class="menu-chevron" />
        </button>
        <div v-if="sub === 'lists'" class="menu menu-sub" role="menu">
          <button v-for="l in lists" :key="l.id" class="menu-item" role="menuitemcheckbox" :aria-checked="l.conversationIds.includes(conv.id)" type="button" @click="toggleInList(l.id, conv.id)">
            <Check :size="15" :class="{ invisible: !l.conversationIds.includes(conv.id) }" /> {{ l.name }}
          </button>
          <button class="menu-item" role="menuitem" type="button" @click="newListWithThis"><Plus :size="15" /> Nova lista</button>
        </div>
      </div>

      <button class="menu-item" role="menuitem" type="button" @click="exportChat"><Download :size="17" /> Exportar conversa</button>
      <button class="menu-item" role="menuitem" type="button" @click="closeChat"><CircleX :size="17" /> Fechar conversa</button>

      <template v-if="!isGroup && !isSelf">
        <hr class="menu-sep" />
        <button class="menu-item" role="menuitem" type="button" @click="sendLink"><Link :size="17" /> Enviar link de ligação</button>
        <button class="menu-item" role="menuitem" type="button" @click="say('group-call')"><UsersRound :size="17" /> Nova ligação em grupo</button>
      </template>

      <hr class="menu-sep" />
      <template v-if="!isGroup && !isSelf">
        <button class="menu-item" role="menuitem" type="button" @click="say('report')"><Flag :size="17" /> Denunciar</button>
        <button class="menu-item" role="menuitem" type="button" @click="toggleBlock"><Ban :size="17" /> {{ conv.youBlocked ? 'Desbloquear' : 'Bloquear' }}</button>
      </template>
      <button class="menu-item" role="menuitem" type="button" @click="clearChat"><MinusCircle :size="17" /> Limpar conversa</button>
      <button v-if="!isGroup" class="menu-item" role="menuitem" type="button" @click="deleteChat"><Trash2 :size="17" /> Apagar conversa</button>
      <button v-else class="menu-item" role="menuitem" type="button" @click="leaveGroup"><LogOut :size="17" /> Sair do grupo</button>
    </div>
  </div>
</template>
