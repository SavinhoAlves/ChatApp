<script setup lang="ts">
import { Archive, ArchiveRestore, Bell, BellOff, Check, ChevronDown, CircleDot, Ellipsis, Eraser, Info, ListPlus, Lock, LogOut, Pin, PinOff, Plus, Star, Store, Trash2, UserCheck, UserX } from '@lucide/vue';
import type { Conversation } from '~/types';

const props = defineProps<{ conv: Conversation; active: boolean; online: boolean; selecting?: boolean; selected?: boolean }>();
const emit = defineEmits<{ open: [id: string]; toggle: [id: string] }>();

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

// ---- Arrastar o card (celular), como no WhatsApp ----
// Esquerda: "Mais" e "Arquivar". Direita: "Lida/Não lida" e "Fixar". Solta além do meio: fica aberto.
const ACTIONS_W = 160;
const swipeX = ref(0);
const swipeOpen = ref<'left' | 'right' | null>(null);
let touch: { x: number; y: number; base: number } | null = null;
let horizontal = false;
const dragging = ref(false);
function swipeStart(e: TouchEvent) {
  if (props.selecting) return;
  press.onTouchstart(e);
  const t = e.touches[0];
  if (!t) return;
  touch = { x: t.clientX, y: t.clientY, base: swipeX.value };
  horizontal = false;
}
function swipeMove(e: TouchEvent) {
  press.onTouchmove(e);
  const t = e.touches[0];
  if (!touch || !t) return;
  const dx = t.clientX - touch.x;
  if (!horizontal) {
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(t.clientY - touch.y) * 1.4) return;
    horizontal = true;
    dragging.value = true;
  }
  swipeX.value = Math.max(-ACTIONS_W, Math.min(ACTIONS_W, touch.base + dx));
}
function swipeEnd() {
  press.onTouchend();
  if (horizontal) {
    if (swipeX.value <= -ACTIONS_W / 2) {
      swipeX.value = -ACTIONS_W;
      swipeOpen.value = 'left';
    } else if (swipeX.value >= ACTIONS_W / 2) {
      swipeX.value = ACTIONS_W;
      swipeOpen.value = 'right';
    } else closeSwipe();
  }
  touch = null;
  dragging.value = false;
}
function closeSwipe() {
  swipeX.value = 0;
  swipeOpen.value = null;
}
function openOrClose() {
  // Selecionando conversas (⋯ › Selecionar): o toque marca/desmarca em vez de abrir.
  if (props.selecting) emit('toggle', props.conv.id);
  else if (swipeOpen.value) closeSwipe();
  else open();
}
async function swipeAction(fn: () => unknown) {
  closeSwipe();
  await fn();
}

const unread = computed(() => props.conv.unreadCount > 0);
const toggleRead = () =>
  unread.value
    ? run(async () => {
        await chat.setConversationPrefs(props.conv.id, { forcedUnread: false });
        chat.markRead(props.conv.id);
      })
    : markUnread();

// ---- "Mais": janela de baixo com as opções ----
const moreOpen = ref(false);
// Menu pequeno preso ao card (abaixo dele, ou acima se não couber), sem escurecer/desfocar o resto.
const morePos = ref<Record<string, string>>({});
function openMore() {
  const r = root.value?.getBoundingClientRect();
  if (r) {
    const below = window.innerHeight - r.bottom;
    morePos.value = below > 360 || below > r.top ? { top: `${r.bottom - 6}px` } : { bottom: `${window.innerHeight - r.top - 6}px` };
  }
  moreOpen.value = true;
}
const listsOpen = ref(false);
const { lists, toggleInList, createList } = useLists();
const peerName = computed(() => (otherUser.value ? chat.conversationTitle(props.conv) : ''));

function openInfo() {
  moreOpen.value = false;
  emit('open', props.conv.id);
  useState<string | null>('ui.infoFor').value = props.conv.id;
}
async function lockConversation() {
  moreOpen.value = false;
  await alert({ title: 'Trancar conversa', message: 'Em breve: esconder a conversa atrás de senha ou digital.' });
}
async function toggleList(listId: string) {
  await toggleInList(listId, props.conv.id).catch((e) => alert((e as Error).message));
}
async function newListWithThis() {
  const name = await useConfirm().prompt({ title: 'Nova lista', placeholder: 'Ex.: Família, Trabalho', confirmLabel: 'Criar', maxLength: 40 });
  if (name) await createList(name, [props.conv.id]).catch((e) => alert((e as Error).message));
}
const inList = (id: string) => lists.value.find((l) => l.id === id)?.conversationIds.includes(props.conv.id);
function more(fn: () => unknown) {
  moreOpen.value = false;
  void fn();
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
  <div ref="root" class="conv-row" :class="{ swiping: swipeX !== 0 }">
    <!-- Ações reveladas ao arrastar -->
    <div v-if="swipeX > 0" class="swipe-actions left">
      <button type="button" class="sa-read" @click="swipeAction(toggleRead)">
        <CircleDot :size="20" :stroke-width="2" /> {{ unread ? 'Lida' : 'Não lida' }}
      </button>
      <button type="button" class="sa-pin" @click="swipeAction(togglePin)">
        <PinOff v-if="conv.pinned" :size="20" :stroke-width="2" />
        <Pin v-else :size="20" :stroke-width="2" />
        {{ conv.pinned ? 'Desafixar' : 'Fixar' }}
      </button>
    </div>
    <div v-if="swipeX < 0" class="swipe-actions right">
      <button type="button" class="sa-more" @click="swipeAction(openMore)">
        <Ellipsis :size="20" :stroke-width="2" /> Mais
      </button>
      <button type="button" class="sa-archive" @click="swipeAction(toggleArchive)">
        <ArchiveRestore v-if="conv.archived" :size="20" :stroke-width="2" />
        <Archive v-else :size="20" :stroke-width="2" />
        {{ conv.archived ? 'Desarquivar' : 'Arquivar' }}
      </button>
    </div>
    <button
      class="conv-item"
      :class="{ active: active && !selecting, selected }"
      type="button"
      :style="swipeX ? { transform: `translateX(${swipeX}px)`, transition: dragging ? 'none' : undefined } : undefined"
      @click="openOrClose"
      @touchstart.passive="swipeStart"
      @touchmove.passive="swipeMove"
      @touchend="swipeEnd"
      @touchcancel="swipeEnd"
      @contextmenu="press.onContextmenu"
    >
      <span v-if="selecting" class="select-check conv-check" :class="{ on: selected }" aria-hidden="true">
        <Check v-if="selected" :size="13" :stroke-width="3" />
      </span>
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

    <!-- "Mais" (arrastar para a esquerda) -->
    <Teleport to="body">
      <div v-if="moreOpen" class="more-backdrop" @click.self="moreOpen = false">
        <div class="more-menu" role="menu" :aria-label="chat.conversationTitle(conv)" :style="morePos">
          <div class="more-group">
            <button type="button" @click="more(toggleMute)">
              <Bell v-if="isMuted" :size="19" :stroke-width="2" /><BellOff v-else :size="19" :stroke-width="2" />
              {{ isMuted ? 'Ativar notificações' : 'Silenciar' }}
            </button>
            <button type="button" @click="openInfo">
              <Info :size="19" :stroke-width="2" /> {{ conv.type === 'GROUP' ? 'Dados do grupo' : 'Dados do contato' }}
            </button>
            <button type="button" @click="lockConversation"><Lock :size="19" :stroke-width="2" /> Trancar conversa</button>
            <button type="button" @click="more(toggleFavorite)">
              <Star :size="19" :stroke-width="2" :fill="conv.favorited ? 'currentColor' : 'none'" />
              {{ conv.favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos' }}
            </button>
            <button type="button" @click="listsOpen = !listsOpen"><ListPlus :size="19" :stroke-width="2" /> Adicionar à lista</button>
            <div v-if="listsOpen" class="more-lists">
              <button v-for="l in lists" :key="l.id" type="button" @click="toggleList(l.id)">
                <Check v-if="inList(l.id)" :size="16" :stroke-width="2.6" /><span v-else class="more-lists-gap" />
                {{ l.name }}
              </button>
              <button type="button" @click="newListWithThis"><Plus :size="16" :stroke-width="2.4" /> Nova lista</button>
            </div>
            <button type="button" @click="more(clearConversation)"><Eraser :size="19" :stroke-width="2" /> Limpar conversa</button>
          </div>
          <div class="more-group danger">
            <template v-if="conv.type === 'DIRECT'">
              <button v-if="!chat.isSelfChat(conv)" type="button" @click="more(toggleBlock)">
                <UserCheck v-if="conv.youBlocked" :size="19" :stroke-width="2" /><UserX v-else :size="19" :stroke-width="2" />
                {{ conv.youBlocked ? `Desbloquear ${peerName}` : `Bloquear ${peerName}` }}
              </button>
              <button type="button" @click="more(deleteConversation)"><Trash2 :size="19" :stroke-width="2" /> Apagar conversa</button>
            </template>
            <button v-else type="button" @click="more(leaveGroup)"><LogOut :size="19" :stroke-width="2" /> Sair do grupo</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
