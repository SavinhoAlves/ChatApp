<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  CircleDot,
  Eraser,
  LogOut,
  Pin,
  PinOff,
  Star,
  Store,
  Trash2,
  UserCheck,
  UserX,
} from '@lucide/vue';
import type { Conversation } from '~/types';

const props = defineProps<{ conv: Conversation; active: boolean; online: boolean }>();
const emit = defineEmits<{ open: [id: string] }>();

const { me } = useAuth();
const chat = useChat();
const { confirm, alert } = useConfirm();

const menuOpen = ref(false);
const root = ref<HTMLElement | null>(null);
const menuBtn = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
// O menu é desenhado fora da lista (Teleport + position: fixed): dentro dela ele era cortado pela
// rolagem (ex.: lista de Arquivadas). Abre para cima quando não cabe embaixo.
const menuStyle = ref<Record<string, string>>({});
const MENU_HEIGHT = 330;
const MENU_WIDTH = 230;

function toggleMenu(point?: { x: number; y: number }) {
  if (menuOpen.value) {
    menuOpen.value = false;
    return;
  }
  // Toque longo: o menu abre onde o dedo está (no celular o botão da setinha fica escondido).
  const rect = point ? new DOMRect(point.x, point.y, 0, 0) : menuBtn.value?.getBoundingClientRect();
  if (rect) {
    const below = window.innerHeight - rect.bottom;
    // Pela setinha: alinha à direita dela. Pelo toque: centraliza no dedo, sem sair da tela.
    const x: Record<string, string> = point
      ? { left: `${Math.min(Math.max(8, point.x - MENU_WIDTH / 2), window.innerWidth - MENU_WIDTH - 8)}px`, right: 'auto' }
      : { right: `${Math.max(8, window.innerWidth - rect.right)}px` };
    menuStyle.value =
      below < MENU_HEIGHT && rect.top > below
        ? { bottom: `${window.innerHeight - rect.top + 4}px`, ...x }
        : { top: `${rect.bottom + 4}px`, ...x };
  }
  menuOpen.value = true;
}

const press = useLongPress((point) => toggleMenu(point));

function open() {
  if (!press.consumeClick()) emit('open', props.conv.id);
}

// Rolou a lista ou mudou o tamanho da janela: fecha (a posição fixa ficaria errada).
function closeMenu() {
  menuOpen.value = false;
}
onMounted(() => {
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('resize', closeMenu);
});

const isMuted = computed(() => !!props.conv.mutedUntil && new Date(props.conv.mutedUntil).getTime() > Date.now());
const otherUser = computed(() => (props.conv.type === 'DIRECT' ? chat.otherUser(props.conv) : null));

function closeOnOutsideClick(event: MouseEvent) {
  const target = event.target as Node;
  if (menuOpen.value && !root.value?.contains(target) && !menuEl.value?.contains(target)) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closeOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeOnOutsideClick));

async function run(action: () => Promise<unknown>) {
  menuOpen.value = false;
  try {
    await action();
  } catch (e) {
    await alert((e as Error).message);
  }
}

const toggleArchive = () => run(() => chat.setConversationPrefs(props.conv.id, { archived: !props.conv.archived }));
const togglePin = () => run(() => chat.setConversationPrefs(props.conv.id, { pinned: !props.conv.pinned }));
const toggleFavorite = () => run(() => chat.setConversationPrefs(props.conv.id, { favorited: !props.conv.favorited }));
const markUnread = () => run(() => chat.setConversationPrefs(props.conv.id, { forcedUnread: true }));
// "Sempre": um prazo bem longo (10 anos) — dá pra desfazer a qualquer momento clicando em "Ativar notificações".
const toggleMute = () =>
  run(() => chat.setConversationPrefs(props.conv.id, { muteMinutes: isMuted.value ? null : 10 * 365 * 24 * 60 }));

async function clearConversation() {
  menuOpen.value = false;
  const ok = await confirm('Limpar o histórico desta conversa? Isso só afeta o que você vê.');
  if (!ok) return;
  void run(() => chat.clearConversationHistory(props.conv.id));
}

async function deleteConversation() {
  menuOpen.value = false;
  const ok = await confirm({
    message: 'Apagar esta conversa? Ela some da sua lista, mas volta se chegar mensagem nova.',
    confirmLabel: 'Apagar',
    danger: true,
  });
  if (!ok) return;
  void run(() => chat.hideConversation(props.conv.id));
}

async function leaveGroup() {
  menuOpen.value = false;
  const ok = await confirm({ message: 'Sair deste grupo?', confirmLabel: 'Sair', danger: true });
  if (!ok) return;
  void run(() => chat.removeMember(props.conv.id, me.value!.id));
}

async function toggleBlock() {
  menuOpen.value = false;
  const user = otherUser.value;
  if (!user) return;
  if (props.conv.youBlocked) {
    void run(() => chat.unblockUser(user.id, props.conv.id));
    return;
  }
  const ok = await confirm({
    message: `Bloquear ${user.displayName}? A pessoa não vai mais conseguir te mandar mensagem.`,
    confirmLabel: 'Bloquear',
    danger: true,
  });
  if (!ok) return;
  void run(() => chat.blockUser(user.id, props.conv.id));
}
</script>

<template>
  <div ref="root" class="conv-row">
    <button
      class="conv-item"
      :class="{ active }"
      type="button"
      @click="open"
      @touchstart.passive="press.onTouchstart"
      @touchmove.passive="press.onTouchmove"
      @touchend="press.onTouchend"
      @touchcancel="press.onTouchcancel"
      @contextmenu="press.onContextmenu"
    >
      <Avatar
        :name="chat.conversationTitle(conv)"
        :seed="conv.id"
        :online="online"
        :square="conv.type === 'GROUP'"
        :src="conv.type === 'DIRECT' ? chat.otherUser(conv)?.avatarUrl : null"
      />
      <span class="conv-body">
        <span class="conv-top">
          <span class="conv-name">
            <Pin v-if="conv.pinned" :size="12" :stroke-width="2.4" class="conv-flag" />
            {{ chat.conversationTitle(conv) }}
            <Store v-if="conv.type === 'DIRECT' && otherUser?.isBusiness" :size="12" :stroke-width="2.4" class="conv-flag business" aria-label="Conta comercial" />
          </span>
          <time class="conv-time" :class="{ unread: conv.unreadCount > 0 }">{{ formatListTime(conv.lastMessageAt) }}</time>
        </span>
        <span class="conv-bottom">
          <span class="conv-preview">
            <BellOff v-if="isMuted" :size="12" :stroke-width="2.2" class="conv-flag" />
            {{ chat.previewText(conv) }}
          </span>
          <span class="conv-trailing">
            <Star v-if="conv.favorited" :size="13" :stroke-width="2" fill="currentColor" class="conv-flag star" />
            <span v-if="conv.unreadCount > 0" class="badge">{{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}</span>
          </span>
        </span>
      </span>
    </button>

    <button
      ref="menuBtn"
      class="icon-btn conv-menu-btn"
      :class="{ open: menuOpen }"
      type="button"
      aria-label="Mais opções"
      :aria-expanded="menuOpen"
      @click.stop="toggleMenu()"
    >
      <ChevronDown :size="18" :stroke-width="2" />
    </button>

    <Teleport to="body">
    <Transition name="dropdown">
      <div v-if="menuOpen" ref="menuEl" class="menu conv-menu floating" role="menu" :style="menuStyle">
        <button class="menu-item" role="menuitem" type="button" @click="toggleArchive">
          <ArchiveRestore v-if="conv.archived" :size="15" :stroke-width="2" />
          <Archive v-else :size="15" :stroke-width="2" />
          {{ conv.archived ? 'Desarquivar conversa' : 'Arquivar conversa' }}
        </button>
        <button class="menu-item" role="menuitem" type="button" @click="toggleMute">
          <Bell v-if="isMuted" :size="15" :stroke-width="2" />
          <BellOff v-else :size="15" :stroke-width="2" />
          {{ isMuted ? 'Ativar notificações' : 'Silenciar notificações' }}
        </button>
        <button class="menu-item" role="menuitem" type="button" @click="togglePin">
          <PinOff v-if="conv.pinned" :size="15" :stroke-width="2" />
          <Pin v-else :size="15" :stroke-width="2" />
          {{ conv.pinned ? 'Desafixar conversa' : 'Fixar conversa' }}
        </button>
        <button class="menu-item" role="menuitem" type="button" @click="markUnread">
          <CircleDot :size="15" :stroke-width="2" /> Marcar como não lida
        </button>
        <button class="menu-item" role="menuitem" type="button" @click="toggleFavorite">
          <Star :size="15" :stroke-width="2" :fill="conv.favorited ? 'currentColor' : 'none'" />
          {{ conv.favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos' }}
        </button>
        <button v-if="conv.type === 'DIRECT' && !chat.isSelfChat(conv)" class="menu-item" role="menuitem" type="button" @click="toggleBlock">
          <UserCheck v-if="conv.youBlocked" :size="15" :stroke-width="2" />
          <UserX v-else :size="15" :stroke-width="2" />
          {{ conv.youBlocked ? 'Desbloquear' : 'Bloquear' }}
        </button>
        <button class="menu-item" role="menuitem" type="button" @click="clearConversation">
          <Eraser :size="15" :stroke-width="2" /> Limpar conversa
        </button>
        <button v-if="conv.type === 'DIRECT'" class="menu-item danger" role="menuitem" type="button" @click="deleteConversation">
          <Trash2 :size="15" :stroke-width="2" /> Apagar conversa
        </button>
        <button v-else class="menu-item danger" role="menuitem" type="button" @click="leaveGroup">
          <LogOut :size="15" :stroke-width="2" /> Sair do grupo
        </button>
      </div>
    </Transition>
    </Teleport>
  </div>
</template>
