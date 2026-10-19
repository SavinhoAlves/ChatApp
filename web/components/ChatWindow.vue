<script setup lang="ts">
import { ArrowLeft, Ban, Camera, Check, ChevronDown, ChevronUp, Copy, File, FileText, Images, Lock, MapPin, Mic, Phone, Pin, Plus, Search, Send, ShieldAlert, Smile, Sticker, Store, Timer, Trash2, Upload, UserPlus, UserRound, Video, X } from '@lucide/vue';
import type { StickerRef } from '~/composables/useStickers';
import type { Attachment, Message, User } from '~/types';
import { formatPhone } from '~/utils/phone';

const emit = defineEmits<{ info: []; 'contact-info': []; search: []; 'add-member': [] }>();

const { me, upload } = useAuth();
const chat = useChat();
const { confirm } = useConfirm();
const { prefs, themeFor, wallpaperStyle } = usePrefs();
const calls = useCall();

// Tema da conversa (cor das suas mensagens + papel de parede).
const theme = computed(() => (conv.value ? themeFor(conv.value.id) : null));

// ---- Topo: área toda clicável abre os dados; ícones à direita ----
const isSelfChat = computed(() => !!conv.value && chat.isSelfChat(conv.value));
function openInfo() {
  if (isGroup.value) emit('info');
  else emit('contact-info');
}
const groupCallMenu = ref(false);
const groupCallRoot = ref<HTMLElement | null>(null);
function closeGroupCallMenu(e: MouseEvent) {
  if (groupCallMenu.value && groupCallRoot.value && !groupCallRoot.value.contains(e.target as Node)) groupCallMenu.value = false;
}
onMounted(() => document.addEventListener('click', closeGroupCallMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeGroupCallMenu));

async function startCall(video: boolean) {
  groupCallMenu.value = false;
  if (!conv.value) return;
  await calls.startCall({ conversationId: conv.value.id }, video);
  if (calls.error.value) flash(calls.error.value);
}

// Diálogos abertos pelo menu ⋮
const showDisappearing = ref(false);
const showTheme = ref(false);
const showReport = ref(false);
const showGroupCall = ref(false);

const disappearLabel = computed(() => {
  const s = conv.value?.disappearSeconds;
  if (!s) return '';
  return s >= 90 * 86400 ? '90 dias' : s >= 7 * 86400 ? '7 dias' : '24 horas';
});

// ---- Selecionar mensagens ----
const selecting = ref(false);
const selectedIds = ref<string[]>([]);
function startSelecting() {
  selecting.value = true;
  selectedIds.value = [];
}
function stopSelecting() {
  selecting.value = false;
  selectedIds.value = [];
}
function toggleSelected(m: Message) {
  selectedIds.value = selectedIds.value.includes(m.id) ? selectedIds.value.filter((id) => id !== m.id) : [...selectedIds.value, m.id];
}
const selectedMessages = computed(() => list.value.filter((m) => selectedIds.value.includes(m.id)));
const canDeleteSelected = computed(() => selectedMessages.value.length > 0 && selectedMessages.value.every((m) => !m.deleted));

async function copySelected() {
  const text = selectedMessages.value
    .filter((m) => m.body)
    .map((m) => (selectedMessages.value.length > 1 ? `[${formatTime(m.createdAt)}] ${m.senderId === me.value?.id ? 'Você' : chat.userName(conv.value!, m.senderId)}: ${m.body}` : m.body))
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    flash(selectedMessages.value.length > 1 ? 'Mensagens copiadas' : 'Mensagem copiada');
  } catch {
    flash('Não foi possível copiar');
  }
  stopSelecting();
}

function deleteSelected() {
  deleting.value = [...selectedMessages.value];
}

// "Apagar": janela com "Apagar para mim" / "Apagar para todos" (este último com prazo; master sem prazo).
const deleting = ref<Message[] | null>(null);
function onDeleted(error?: string) {
  deleting.value = null;
  if (error) flash(error);
  if (selecting.value) stopSelecting();
}

// Encaminhar e Dados da mensagem.
const forwarding = ref<Message | null>(null);
const infoFor = ref<Message | null>(null);
function onForward(ids: string[]) {
  const m = forwarding.value;
  forwarding.value = null;
  if (!m) return;
  chat.forward(m, ids);
  flash(ids.length > 1 ? `Encaminhada para ${ids.length} conversas` : 'Mensagem encaminhada');
}

// Mensagem fixada: tocar leva até ela; o X desafixa.
function goToPinned() {
  const pinned = conv.value?.pinnedMessage;
  if (pinned && conv.value) void chat.jumpToMessage(conv.value.id, pinned.id);
}
async function unpin() {
  if (conv.value) await chat.pinMessage(conv.value.id, null).catch((e) => flash((e as Error).message));
}

// ---- Resultado da pesquisa: rola até a mensagem e pisca ----
const highlighted = ref<string | null>(null);
watch(chat.jumpTarget, async (id) => {
  if (!id) return;
  await nextTick();
  const el = scroller.value?.querySelector(`[data-mid="${id}"]`);
  if (!el) {
    flash('Mensagem não encontrada');
    return;
  }
  stick.value = false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  highlighted.value = id;
  setTimeout(() => {
    if (highlighted.value === id) highlighted.value = null;
  }, 2200);
});
const { activeConversation: conv, messages, hasMore, activeId, online, otherUser } = chat;

const list = computed(() => (activeId.value ? (messages.value[activeId.value] ?? []) : []));

// Cada linha sabe se precisa do separador de dia ("Hoje", "Ontem"...) antes dela.
const rows = computed(() =>
  list.value.map((message, i) => {
    const prev = list.value[i - 1];
    const next = list.value[i + 1];
    const day = !prev || !isSameDay(prev.createdAt, message.createdAt) ? formatDayLabel(message.createdAt) : null;
    const nextSameRun = !!next && next.senderId === message.senderId && isSameDay(next.createdAt, message.createdAt);
    return {
      message,
      day,
      // Grupo, estilo do print: nome no começo de cada sequência e foto na última mensagem dela.
      runStart: !prev || prev.senderId !== message.senderId || !!day,
      runEnd: !nextSameRun,
    };
  }),
);

/** Cor estável por pessoa para o nome no grupo (como no WhatsApp). */
function nameColor(userId: string) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash} 78% 70%)`;
}

function participant(userId: string) {
  return conv.value?.participants.find((p) => p.userId === userId) ?? null;
}

const isGroup = computed(() => conv.value?.type === 'GROUP');
const title = computed(() => (conv.value ? chat.conversationTitle(conv.value) : ''));
const subtitle = computed(() => (conv.value ? chat.subtitle(conv.value) : ''));
const isTypingNow = computed(() => !!activeId.value && (chat.typing.value[activeId.value]?.length ?? 0) > 0);
const peerOnline = computed(() => {
  const other = conv.value && conv.value.type === 'DIRECT' && !chat.isSelfChat(conv.value) ? otherUser(conv.value) : null;
  return !!other && !!online.value[other.id];
});

// Conversa 1:1 com alguém que não está nos contatos: aviso com Bloquear / Adicionar (como no WhatsApp).
const showUnknownBanner = computed(() => !!conv.value && conv.value.type === 'DIRECT' && !conv.value.peerIsContact);
const peerLabel = computed(() => (conv.value?.peerPhone ? formatPhone(conv.value.peerPhone) : null) ?? '');
const bannerBusy = ref(false);

async function bannerAction(fn: () => Promise<void>) {
  bannerBusy.value = true;
  try {
    await fn();
  } catch (e) {
    flash((e as Error).message);
  } finally {
    bannerBusy.value = false;
  }
}

async function blockPeer() {
  const c = conv.value;
  const peer = c ? otherUser(c) : null;
  if (!c || !peer) return;
  const ok = await confirm({
    title: `Bloquear ${peer.displayName}?`,
    message: 'Essa pessoa não poderá mais te mandar mensagens.',
    confirmLabel: 'Bloquear',
    danger: true,
  });
  if (ok) await bannerAction(() => chat.blockUser(peer.id, c.id));
}

async function unblockPeer() {
  const c = conv.value;
  const peer = c ? otherUser(c) : null;
  if (c && peer) await bannerAction(() => chat.unblockUser(peer.id, c.id));
}

// "Adicionar": como no WhatsApp, confirma o nome (sugere o do perfil) antes de salvar.
async function addPeer() {
  const c = conv.value;
  if (!c) return;
  const peer = chat.otherUser(c);
  const name = await useConfirm().prompt({
    title: 'Adicionar aos contatos',
    message: c.peerPhone ? formatPhone(c.peerPhone) : '',
    placeholder: 'Nome do contato',
    value: peer?.profileName ?? '',
    confirmLabel: 'Salvar',
    maxLength: 80,
  });
  if (!name) return;
  await bannerAction(() => chat.addPeerToContacts(c.id, name));
}

const scroller = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);
const draft = ref('');
const drafts: Record<string, string> = {};
const replyTo = ref<Message | null>(null);
const editing = ref<Message | null>(null);
const loadingOlder = ref(false);
const notice = ref('');
// Enquanto estiver perto do fim, novas mensagens rolam a tela; se subiu para ler, não puxa de volta.
const stick = ref(true);

// -----------------------------------------------------------------------
// Anexos (foto, áudio, arquivo)
// -----------------------------------------------------------------------

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const fileInput = ref<HTMLInputElement | null>(null);
const pendingFile = ref<File | null>(null);
const pendingPreview = ref<string | null>(null);
const pendingIsVideo = ref(false);
const uploading = ref(false);

const attachMenuOpen = ref(false);
const attachRoot = ref<HTMLElement | null>(null);
const showCamera = ref(false);
const showLocation = ref(false);
const showContact = ref(false);

function openAttachMenu() {
  pickerOpen.value = false;
  attachMenuOpen.value = !attachMenuOpen.value;
}

function closeAttachMenuOutside(event: MouseEvent) {
  if (attachMenuOpen.value && attachRoot.value && !attachRoot.value.contains(event.target as Node)) attachMenuOpen.value = false;
}
onMounted(() => document.addEventListener('click', closeAttachMenuOutside));
onBeforeUnmount(() => document.removeEventListener('click', closeAttachMenuOutside));

function pickMedia() {
  attachMenuOpen.value = false;
  if (fileInput.value) fileInput.value.accept = 'image/*,video/*';
  fileInput.value?.click();
}

function pickDocument() {
  attachMenuOpen.value = false;
  if (fileInput.value) fileInput.value.accept = '';
  fileInput.value?.click();
}

function openCamera() {
  attachMenuOpen.value = false;
  showCamera.value = true;
}

function openLocation() {
  attachMenuOpen.value = false;
  showLocation.value = true;
}

function openContact() {
  attachMenuOpen.value = false;
  showContact.value = true;
}

async function onCameraCaptured(blob: Blob, kind: 'IMAGE' | 'VIDEO') {
  showCamera.value = false;
  const id = activeId.value;
  if (!id) return;
  uploading.value = true;
  try {
    const name = kind === 'IMAGE' ? `foto-${Date.now()}.jpg` : `video-${Date.now()}.webm`;
    const attachment = await upload(blob, name);
    chat.send(id, '', null, attachment);
    stick.value = true;
    scrollToBottom();
  } catch (e) {
    flash((e as Error).message);
  } finally {
    uploading.value = false;
  }
}

function onContactPicked(user: User) {
  showContact.value = false;
  if (activeId.value) chat.sendContact(activeId.value, user);
}

async function onContactOpen(userId: string) {
  try {
    await chat.createDirect(userId);
  } catch (e) {
    flash((e as Error).message);
  }
}

function onFileChosen(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  (event.target as HTMLInputElement).value = '';
  if (file) setPendingFile(file);
}

/** Prepara um arquivo para enviar (com prévia e legenda opcional). */
function setPendingFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    flash('Arquivo maior que 20 MB.');
    return;
  }
  clearPendingFile();
  pendingFile.value = file;
  pendingIsVideo.value = file.type.startsWith('video/');
  if (file.type.startsWith('image/') || pendingIsVideo.value) pendingPreview.value = URL.createObjectURL(file);
  focusInput();
}

/** Vários arquivos de uma vez (arrastados ou colados): envia cada um como mensagem, sem legenda. */
async function sendFilesNow(files: File[]) {
  const id = activeId.value;
  if (!id) return;
  const tooBig = files.filter((f) => f.size > MAX_FILE_SIZE);
  const ok = files.filter((f) => f.size <= MAX_FILE_SIZE);
  if (tooBig.length) flash(`${tooBig.length} arquivo(s) maior(es) que 20 MB não foram enviados.`);
  if (!ok.length) return;
  const sure = await confirm({ title: `Enviar ${ok.length} arquivos?`, message: ok.map((f) => f.name).join(', ').slice(0, 300), confirmLabel: 'Enviar' });
  if (!sure) return;
  uploading.value = true;
  try {
    for (const file of ok) {
      const attachment = await upload(file);
      chat.send(id, '', null, attachment);
    }
    stick.value = true;
    scrollToBottom();
  } catch (e) {
    flash((e as Error).message);
  } finally {
    uploading.value = false;
  }
}

function takeFiles(files: File[]) {
  if (!files.length || editing.value) return;
  if (files.length === 1) setPendingFile(files[0]!);
  else void sendFilesNow(files);
}

// Arrastar e soltar arquivos em qualquer parte da conversa.
const dragging = ref(false);
let dragDepth = 0;
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

function onDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dragging.value = true;
}
function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}
function onDragLeave(e: DragEvent) {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dragging.value = false;
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dragging.value = false;
  takeFiles([...(e.dataTransfer?.files ?? [])]);
}

// Colar (Ctrl+V) imagem ou arquivo copiado direto no campo de mensagem.
function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])];
  if (!files.length) return;
  e.preventDefault();
  takeFiles(files);
}

// Emoji e figurinhas
const pickerOpen = ref(false);
const pickerRoot = ref<HTMLElement | null>(null);
function closePickerOutside(event: MouseEvent) {
  if (pickerOpen.value && pickerRoot.value && !pickerRoot.value.contains(event.target as Node)) pickerOpen.value = false;
}
onMounted(() => document.addEventListener('click', closePickerOutside));
onBeforeUnmount(() => document.removeEventListener('click', closePickerOutside));

function togglePicker() {
  attachMenuOpen.value = false;
  pickerOpen.value = !pickerOpen.value;
}

/** Insere o emoji onde está o cursor (ou no fim). */
function insertEmoji(value: string) {
  const el = input.value;
  const start = el?.selectionStart ?? draft.value.length;
  const end = el?.selectionEnd ?? draft.value.length;
  draft.value = draft.value.slice(0, start) + value + draft.value.slice(end);
  nextTick(() => {
    autosize();
    if (el && !isTouch()) {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    }
  });
}

function sendSticker(sticker: StickerRef) {
  pickerOpen.value = false;
  if (!activeId.value) return;
  chat.send(activeId.value, '', replyTo.value, { type: 'STICKER', url: sticker.url, name: sticker.id });
  replyTo.value = null;
  stick.value = true;
  scrollToBottom();
}

function clearPendingFile() {
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value);
  pendingPreview.value = null;
  pendingFile.value = null;
  pendingIsVideo.value = false;
}

async function uploadPending(): Promise<Attachment | null> {
  if (!pendingFile.value) return null;
  uploading.value = true;
  try {
    return await upload(pendingFile.value);
  } finally {
    uploading.value = false;
  }
}

// -----------------------------------------------------------------------
// Mensagem de voz
// -----------------------------------------------------------------------

// Segurar o microfone grava; soltar envia. Arrastar para a esquerda cancela; para cima trava
// (continua gravando sem segurar). Toque rápido (ou clique no computador) já grava travado.
const voice = useVoiceRecorder();
const recording = voice.recording;
const CANCEL_DX = -110;
const LOCK_DY = -80;
const slideX = ref(0);
const lockProgress = ref(0);
let press: { x: number; y: number; at: number; id: number } | null = null;

async function onMicDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  press = { x: e.clientX, y: e.clientY, at: Date.now(), id: e.pointerId };
  slideX.value = 0;
  lockProgress.value = 0;
  navigator.vibrate?.(15);
  if (!(await voice.start())) {
    press = null;
    flash('Não foi possível acessar o microfone.');
  }
}

function onMicMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.id || voice.locked.value) return;
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  slideX.value = Math.min(0, dx);
  lockProgress.value = Math.min(1, Math.max(0, -dy / -LOCK_DY));
  if (dx < CANCEL_DX) {
    press = null;
    navigator.vibrate?.([10, 40, 10]);
    void voice.stop(false);
  } else if (dy < LOCK_DY) {
    press = null;
    navigator.vibrate?.(20);
    voice.locked.value = true;
  }
}

function onMicUp(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  const quick = Date.now() - press.at < 350 && slideX.value > -10;
  press = null;
  slideX.value = 0;
  lockProgress.value = 0;
  if (!voice.recording.value) return;
  // Toque rápido: grava travado (como clicar no microfone no WhatsApp Web).
  if (quick) voice.locked.value = true;
  else void finishVoice(true);
}

function onMicCancel() {
  if (!press) return;
  press = null;
  slideX.value = 0;
  void voice.stop(false);
}

// Áudios subindo por conversa: enquanto isso aparece o balão com o microfone flutuando.
const sendingVoice = ref<Record<string, number>>({});

async function finishVoice(send: boolean) {
  const id = activeId.value;
  const audio = await voice.stop(send);
  if (!audio || !id) {
    if (send && !audio) flash('Áudio muito curto. Segure para gravar.');
    return;
  }
  sendingVoice.value[id] = (sendingVoice.value[id] ?? 0) + 1;
  stick.value = true;
  scrollToBottom();
  try {
    const attachment = await upload(audio.blob, `audio-${Date.now()}.${audio.ext}`);
    chat.send(id, '', null, attachment);
    stick.value = true;
    scrollToBottom();
  } catch (e) {
    flash((e as Error).message);
  } finally {
    sendingVoice.value[id] = Math.max(0, (sendingVoice.value[id] ?? 1) - 1);
  }
}

function stopRecording(send: boolean) {
  void finishVoice(send);
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

// Ao abrir, fotos/figurinhas/vídeos carregam depois e empurram o fim da conversa para baixo:
// enquanto estiver "grudado" no fim, acompanha cada mudança de altura (abre sempre na última mensagem).
let stickObserver: MutationObserver | null = null;
const followBottom = () => {
  if (stick.value && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
};
watch(scroller, (el, _old, onCleanup) => {
  if (!el) return;
  stickObserver = new MutationObserver(followBottom);
  stickObserver.observe(el, { childList: true, subtree: true });
  el.addEventListener('load', followBottom, true);
  el.addEventListener('loadedmetadata', followBottom, true);
  onCleanup(() => {
    stickObserver?.disconnect();
    el.removeEventListener('load', followBottom, true);
    el.removeEventListener('loadedmetadata', followBottom, true);
  });
}, { immediate: true });

function openStickers() {
  attachMenuOpen.value = false;
  // Depois do clique: senão o "clicou fora" do seletor fecha na mesma hora.
  setTimeout(() => (pickerOpen.value = true));
}

function scrollToBottom() {
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function autosize() {
  const el = input.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

function focusInput() {
  if (!isTouch()) nextTick(() => input.value?.focus());
}

function flash(message: string) {
  notice.value = message;
  setTimeout(() => {
    if (notice.value === message) notice.value = '';
  }, 4000);
}

// Troca de conversa: guarda o rascunho da anterior e restaura o da nova.
watch(
  activeId,
  (id, previous) => {
    if (previous) {
      drafts[previous] = draft.value;
      chat.stopTyping(previous);
    }
    draft.value = id ? (drafts[id] ?? '') : '';
    replyTo.value = null;
    editing.value = null;
    clearPendingFile();
    attachMenuOpen.value = false;
    showCamera.value = false;
    showLocation.value = false;
    showContact.value = false;
    if (recording.value) stopRecording(false);
    stick.value = true;
    nextTick(autosize);
    scrollToBottom();
    focusInput();
  },
  { immediate: true },
);

watch(
  () => list.value[list.value.length - 1]?.id,
  () => {
    const last = list.value[list.value.length - 1];
    if (stick.value || last?.senderId === me.value?.id) scrollToBottom();
  },
);

async function onScroll() {
  const el = scroller.value;
  const id = activeId.value;
  if (!el || !id) return;
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  if (el.scrollTop < 60 && hasMore.value[id] && !loadingOlder.value) {
    loadingOlder.value = true;
    const previousHeight = el.scrollHeight;
    const previousTop = el.scrollTop;
    try {
      await chat.loadOlder(id);
      await nextTick();
      // Mantém a mensagem que estava na tela no mesmo lugar depois de inserir as antigas acima.
      el.scrollTop = el.scrollHeight - previousHeight + previousTop;
    } catch {
      flash('Não foi possível carregar mensagens antigas.');
    } finally {
      loadingOlder.value = false;
    }
  }
}

async function submit() {
  const body = draft.value.trim();
  const id = activeId.value;
  if (!id || (!body && !pendingFile.value) || uploading.value) return;

  if (editing.value) {
    if (!body) return;
    const target = editing.value;
    if (body !== target.body) {
      chat.editMessage(target, body).catch((e: Error) => flash(e.message));
    }
    cancelCompose();
    return;
  }

  let attachment: Attachment | null = null;
  if (pendingFile.value) {
    try {
      attachment = await uploadPending();
    } catch (e) {
      flash((e as Error).message);
      return;
    }
  }

  chat.send(id, body, replyTo.value, attachment);
  chat.stopTyping(id);
  draft.value = '';
  drafts[id] = '';
  replyTo.value = null;
  clearPendingFile();
  stick.value = true;
  nextTick(autosize);
  scrollToBottom();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isTouch() && prefs.value.enterToSend) {
    event.preventDefault();
    submit();
  } else if (event.key === 'Escape') {
    cancelCompose();
  }
}

function onInput(e?: Event) {
  // O v-model ignora o texto enquanto o teclado do Android "compõe" a palavra (sublinhada): lendo direto,
  // o microfone vira "enviar" já na primeira letra.
  if (e?.target) draft.value = (e.target as HTMLTextAreaElement).value;
  autosize();
  if (activeId.value && !editing.value && draft.value.trim()) chat.notifyTyping(activeId.value);
}

function startReply(message: Message) {
  editing.value = null;
  replyTo.value = message;
  focusInput();
}

function startEdit(message: Message) {
  replyTo.value = null;
  editing.value = message;
  draft.value = message.body;
  nextTick(autosize);
  focusInput();
}

function cancelCompose() {
  if (editing.value) draft.value = '';
  editing.value = null;
  replyTo.value = null;
  clearPendingFile();
  nextTick(autosize);
}

function remove(message: Message) {
  deleting.value = [message];
}

onBeforeUnmount(() => {
  clearPendingFile();
  if (recording.value) stopRecording(false);
});

const senderName = (m: Message) => (isGroup.value && m.senderId !== me.value?.id && conv.value ? chat.userName(conv.value, m.senderId) : undefined);
const isIncomingGroup = (m: Message) => isGroup.value && m.senderId !== me.value?.id;
const replyName = (m: Message) => (m.replyTo && conv.value ? chat.userName(conv.value, m.replyTo.senderId) : '');
const replyPreviewName = computed(() => (replyTo.value && conv.value ? chat.userName(conv.value, replyTo.value.senderId) : ''));
</script>

<template>
  <section
    v-if="conv"
    class="main chat wp"
    :style="theme ? { '--mine-rgb': theme.rgb, ...wallpaperStyle(theme.wallpaper) } : undefined"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="dragging" class="drop-overlay" aria-hidden="true">
      <div class="drop-card">
        <Upload :size="34" :stroke-width="1.6" />
        <strong>Solte para enviar</strong>
        <small>Fotos, vídeos e documentos de até 20 MB</small>
      </div>
    </div>

    <header
      class="chat-header"
      role="button"
      tabindex="0"
      :title="isGroup ? 'Dados do grupo' : 'Dados do contato'"
      @click="openInfo"
      @keydown.enter.self="openInfo"
    >
      <button class="icon-btn back-btn" type="button" aria-label="Voltar" @click.stop="chat.closeConversation()">
        <ArrowLeft :size="20" :stroke-width="1.9" />
      </button>
      <span class="chat-title-btn">
        <span class="avatar-wrap">
          <Avatar :name="title" :seed="conv.id" :size="42" :online="peerOnline" :square="isGroup" :src="isGroup ? null : chat.otherUser(conv)?.avatarUrl" />
          <span v-if="conv.disappearSeconds" class="avatar-timer" title="Mensagens temporárias ativadas"><Timer :size="11" :stroke-width="2.6" /></span>
        </span>
        <span class="chat-title">
          <strong>{{ title }}<span v-if="!isGroup && chat.otherUser(conv)?.isBusiness" class="business-mark" title="Conta comercial"><Store :size="14" :stroke-width="2.2" /></span></strong>
          <small :class="{ typing: isTypingNow, live: peerOnline && !isTypingNow }">{{ subtitle }}</small>
        </span>
      </span>

      <div class="chat-actions" @click.stop>
        <template v-if="!isSelfChat">
          <template v-if="!isGroup">
            <button class="icon-btn" type="button" title="Chamada de vídeo" aria-label="Chamada de vídeo" @click="startCall(true)"><Video :size="21" :stroke-width="1.8" /></button>
            <button class="icon-btn" type="button" title="Chamada de voz" aria-label="Chamada de voz" @click="startCall(false)"><Phone :size="19" :stroke-width="1.8" /></button>
          </template>
          <div v-else ref="groupCallRoot" class="group-call">
            <button class="icon-btn wide" type="button" title="Ligação em grupo" aria-haspopup="menu" :aria-expanded="groupCallMenu" @click="groupCallMenu = !groupCallMenu">
              <Video :size="21" :stroke-width="1.8" /><ChevronDown :size="14" :stroke-width="2.2" />
            </button>
            <div v-if="groupCallMenu" class="menu group-call-menu" role="menu">
              <button class="menu-item" role="menuitem" type="button" @click="startCall(false)"><Phone :size="16" /> Ligação de voz</button>
              <button class="menu-item" role="menuitem" type="button" @click="startCall(true)"><Video :size="16" /> Ligação de vídeo</button>
            </div>
          </div>
          <span class="chat-actions-sep hide-mobile" aria-hidden="true" />
        </template>
        <button class="icon-btn hide-mobile" type="button" title="Pesquisar" aria-label="Pesquisar" @click="emit('search')"><Search :size="19" :stroke-width="1.9" /></button>
        <ChatOptionsMenu
          :conv="conv"
          @info="openInfo"
          @search="emit('search')"
          @select="startSelecting"
          @disappearing="showDisappearing = true"
          @theme="showTheme = true"
          @report="showReport = true"
          @add-member="emit('add-member')"
          @group-call="showGroupCall = true"
        />
      </div>
    </header>

    <div v-if="conv.pinnedMessage" class="pinned-bar" role="button" tabindex="0" @click="goToPinned" @keydown.enter="goToPinned">
      <Pin :size="15" :stroke-width="2.2" class="pinned-icon" />
      <span class="pinned-text">
        <small>Mensagem fixada</small>
        <span>{{ conv.pinnedMessage.preview }}</span>
      </span>
      <button class="icon-btn" type="button" aria-label="Desafixar" title="Desafixar" @click.stop="unpin"><X :size="16" /></button>
    </div>

    <div v-if="conv.disappearSeconds" class="temp-banner">
      <Timer :size="14" :stroke-width="2" /> Mensagens temporárias ativadas: novas mensagens somem após {{ disappearLabel }}.
    </div>

    <div v-if="showUnknownBanner" class="unknown-banner">
      <ShieldAlert :size="18" :stroke-width="1.9" class="unknown-banner-icon" />
      <p>
        <strong>{{ peerLabel }}</strong> não está nos seus contatos.<template v-if="chat.otherUser(conv)?.isBusiness"> É uma <strong>conta comercial</strong>.</template>
        <span>Nome no perfil: {{ title }}</span>
      </p>
      <div class="unknown-banner-actions">
        <button v-if="conv.youBlocked" class="btn btn-ghost btn-sm" type="button" :disabled="bannerBusy" @click="unblockPeer">
          Desbloquear
        </button>
        <button v-else class="btn btn-danger btn-sm" type="button" :disabled="bannerBusy" @click="blockPeer">
          <Ban :size="14" :stroke-width="2" /> Bloquear
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="bannerBusy" @click="addPeer">
          <UserPlus :size="14" :stroke-width="2" /> Adicionar
        </button>
      </div>
    </div>

    <div
      ref="scroller"
      class="messages"
      :class="{ selecting }"
      @scroll.passive="onScroll"
    >
      <p v-if="loadingOlder" class="load-more">Carregando mensagens anteriores…</p>
      <p v-else-if="!hasMore[conv.id] && list.length" class="load-more">Início da conversa</p>

      <template v-for="row in rows" :key="row.message.id">
        <div v-if="row.day" class="day-sep">
          <span>{{ row.day }}</span>
        </div>
        <MessageBubble
          :data-mid="row.message.id"
          :message="row.message"
          :mine="row.message.senderId === me?.id"
          :sender-name="row.runStart ? senderName(row.message) : undefined"
          :sender-color="isIncomingGroup(row.message) ? nameColor(row.message.senderId) : undefined"
          :sender-badge="isIncomingGroup(row.message) && participant(row.message.senderId)?.role === 'ADMIN' ? 'Admin' : undefined"
          :avatar-space="isIncomingGroup(row.message)"
          :avatar-user="isIncomingGroup(row.message) && row.runEnd ? (participant(row.message.senderId)?.user ?? null) : null"
          :class="{ 'run-cont': !row.runStart }"
          :reply-name="replyName(row.message)"
          :selecting="selecting"
          :selected="selectedIds.includes(row.message.id)"
          :highlighted="highlighted === row.message.id"
          @toggle-select="toggleSelected"
          @join-call="(id: string) => calls.join(id, true)"
          @reply="startReply"
          @edit="startEdit"
          @remove="remove"
          @forward="forwarding = $event"
          @info="infoFor = $event"
          @retry="chat.retry"
          @contact-open="onContactOpen"
        />
      </template>

      <!-- Áudio subindo: balão com o microfone flutuando até virar a mensagem de verdade -->
      <div v-if="sendingVoice[conv.id]" class="msg-row mine voice-sending-row" aria-live="polite" aria-label="Enviando áudio">
        <div class="bubble voice-sending">
          <span class="vs-mic"><Mic :size="18" :stroke-width="2.2" /></span>
          <span class="vs-wave" aria-hidden="true"><i v-for="n in 16" :key="n" :style="{ animationDelay: `${(n % 8) * 0.09}s` }" /></span>
        </div>
      </div>

      <!-- Alguém digitando: bolinha com três pontos pulando, como no WhatsApp -->
      <div v-if="isTypingNow" class="msg-row typing-row" aria-live="polite" aria-label="digitando">
        <div class="bubble typing-bubble"><span /><span /><span /></div>
      </div>

      <!-- Só depois de carregar: antes aparecia "nenhuma mensagem" por um instante numa conversa cheia. -->
      <p v-if="!list.length && messages[conv.id]" class="empty-chat">Nenhuma mensagem ainda. Diga olá! 👋</p>
    </div>

    <footer v-if="selecting" class="composer select-bar">
      <button class="icon-btn" type="button" aria-label="Cancelar seleção" @click="stopSelecting"><X :size="20" /></button>
      <strong>{{ selectedIds.length }} {{ selectedIds.length === 1 ? 'selecionada' : 'selecionadas' }}</strong>
      <span class="select-bar-actions">
        <button class="icon-btn" type="button" title="Copiar" aria-label="Copiar" :disabled="!selectedIds.length" @click="copySelected"><Copy :size="19" /></button>
        <button class="icon-btn" type="button" title="Apagar" aria-label="Apagar" :disabled="!canDeleteSelected" @click="deleteSelected"><Trash2 :size="19" /></button>
      </span>
    </footer>

    <footer v-else class="composer">
      <p v-if="notice" class="composer-notice" role="alert">{{ notice }}</p>

      <ReplyCard v-if="replyTo && !editing" class="composer-bar composer-reply" :name="replyPreviewName" :reply="replyTo">
        <button class="icon-btn reply-cancel" type="button" aria-label="Cancelar resposta" @click="cancelCompose">
          <X :size="18" :stroke-width="2" />
        </button>
      </ReplyCard>
      <div v-else-if="editing" class="composer-bar">
        <div class="composer-bar-text">
          <strong>Editando mensagem</strong>
          <span>{{ editing.body }}</span>
        </div>
        <button class="icon-btn" type="button" aria-label="Cancelar" @click="cancelCompose">
          <X :size="18" :stroke-width="2" />
        </button>
      </div>

      <div v-if="pendingFile" class="composer-bar">
        <img v-if="pendingPreview && !pendingIsVideo" :src="pendingPreview" class="composer-bar-thumb" alt="" />
        <video v-else-if="pendingPreview" :src="pendingPreview" class="composer-bar-thumb" muted />
        <File v-else :size="22" :stroke-width="1.8" class="composer-bar-file-icon" />
        <div class="composer-bar-text">
          <strong>{{ pendingFile.name }}</strong>
          <span>{{ formatBytes(pendingFile.size) }}</span>
        </div>
        <button class="icon-btn" type="button" aria-label="Remover anexo" :disabled="uploading" @click="clearPendingFile">
          <X :size="18" :stroke-width="2" />
        </button>
      </div>

      <div v-if="recording && voice.locked.value" class="composer-row recording-bar">
        <button class="icon-btn" type="button" aria-label="Cancelar gravação" @click="stopRecording(false)">
          <Trash2 :size="20" :stroke-width="2" />
        </button>
        <span class="rec-dot" aria-hidden="true" />
        <span class="rec-time">{{ voice.label.value }}</span>
        <span class="rec-wave" aria-hidden="true"><i v-for="(l, i) in voice.levels.value" :key="i" :style="{ height: `${Math.round(l * 100)}%` }" /></span>
        <button class="send-btn" type="button" aria-label="Enviar áudio" @click="stopRecording(true)">
          <Send :size="19" :stroke-width="2.2" />
        </button>
      </div>
      <div v-else class="composer-row" :class="{ 'is-recording': recording }">
        <!-- Segurando o microfone: tempo, ondas e "deslize para cancelar" no lugar do campo. -->
        <span v-if="recording" class="rec-inline">
          <span class="rec-dot" aria-hidden="true" />
          <span class="rec-time">{{ voice.label.value }}</span>
          <span class="rec-wave" aria-hidden="true"><i v-for="(l, i) in voice.levels.value.slice(-18)" :key="i" :style="{ height: `${Math.round(l * 100)}%` }" /></span>
          <span class="rec-cancel" :style="{ transform: `translateX(${slideX}px)`, opacity: 1 + slideX / 140 }">‹ Deslize para cancelar</span>
        </span>
        <span ref="attachRoot" style="display: contents">
          <button
            class="icon-btn attach-btn"
            :class="{ open: attachMenuOpen }"
            type="button"
            aria-label="Anexar"
            title="Anexar"
            :disabled="uploading || !!editing"
            @click="openAttachMenu"
          >
            <Plus :size="22" :stroke-width="1.9" />
          </button>
          <input ref="fileInput" type="file" class="attach-input" @change="onFileChosen" />
          <div v-if="attachMenuOpen" class="attach-menu" role="menu">
            <button class="menu-item" role="menuitem" type="button" @click="pickMedia"><Images :size="16" :stroke-width="1.8" /> Foto ou vídeo</button>
            <button class="menu-item" role="menuitem" type="button" @click="openCamera"><Camera :size="16" :stroke-width="1.8" /> Câmera</button>
            <button class="menu-item" role="menuitem" type="button" @click="openLocation"><MapPin :size="16" :stroke-width="1.8" /> Localização</button>
            <button class="menu-item" role="menuitem" type="button" @click="openContact"><UserRound :size="16" :stroke-width="1.8" /> Contato</button>
            <button class="menu-item" role="menuitem" type="button" @click="pickDocument"><FileText :size="16" :stroke-width="1.8" /> Documento</button>
            <!-- No celular o emoji vem do teclado; as figurinhas ficam aqui -->
            <button class="menu-item only-touch" role="menuitem" type="button" @click="openStickers"><Sticker :size="16" :stroke-width="1.8" /> Figurinha</button>
          </div>
        </span>
        <span ref="pickerRoot" class="picker-anchor">
          <button
            class="icon-btn emoji-btn"
            :class="{ active: pickerOpen }"
            type="button"
            aria-label="Emojis e figurinhas"
            title="Emojis e figurinhas"
            @click="togglePicker"
          >
            <Smile :size="21" :stroke-width="1.8" />
          </button>
          <EmojiStickerPicker v-if="pickerOpen" @emoji="insertEmoji" @sticker="sendSticker" />
        </span>
        <textarea
          ref="input"
          v-model="draft"
          class="composer-input"
          rows="1"
          maxlength="4000"
          placeholder="Digite uma mensagem"
          aria-label="Mensagem"
          enterkeyhint="send"
          @keydown="onKeydown"
          @input="onInput"
          @paste="onPaste"
        />
        <span v-if="!editing && !draft.trim() && !pendingFile" class="mic-wrap">
          <span v-if="recording" class="rec-lock" :style="{ transform: `translateY(${-lockProgress * 24}px)` }" aria-hidden="true">
            <Lock :size="16" :stroke-width="2.2" />
            <ChevronUp :size="14" :stroke-width="2.4" />
          </span>
          <button
            class="icon-btn mic-btn"
            :class="{ holding: recording }"
            type="button"
            aria-label="Segure para gravar áudio"
            @pointerdown="onMicDown"
            @pointermove="onMicMove"
            @pointerup="onMicUp"
            @pointercancel="onMicCancel"
            @contextmenu.prevent
          >
            <Mic :size="20" :stroke-width="1.8" />
          </button>
        </span>
        <button
          v-else
          class="send-btn"
          type="button"
          :disabled="uploading || (!draft.trim() && !pendingFile)"
          :aria-label="editing ? 'Salvar edição' : 'Enviar'"
          @click="submit"
        >
          <Send v-if="!editing" :size="19" :stroke-width="2.2" />
          <Check v-else :size="20" :stroke-width="2.4" />
        </button>
      </div>
    </footer>

    <CameraDialog v-if="showCamera" @close="showCamera = false" @captured="onCameraCaptured" />
    <DeleteMessagesDialog v-if="deleting" :messages="deleting" @close="deleting = null" @done="onDeleted" />
    <SendToDialog v-if="forwarding" title="Encaminhar para…" @close="forwarding = null" @pick="onForward" />
    <MessageInfoDialog v-if="infoFor" :message="infoFor" @close="infoFor = null" />
    <LocationDialog v-if="showLocation && conv" :conversation-id="conv.id" @close="showLocation = false" />
    <ShareContactDialog v-if="showContact" @close="showContact = false" @pick="onContactPicked" />
    <DisappearingDialog v-if="showDisappearing" :conversation="conv" @close="showDisappearing = false" />
    <ChatThemeDialog v-if="showTheme" :conversation-id="conv.id" @close="showTheme = false" />
    <ReportDialog v-if="showReport" :conversation="conv" @close="showReport = false" />
    <GroupCallDialog v-if="showGroupCall" :preselect="chat.otherUser(conv) ? [chat.otherUser(conv)!.id] : []" @close="showGroupCall = false" />
  </section>
</template>
