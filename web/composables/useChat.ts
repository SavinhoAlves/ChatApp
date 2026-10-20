import { io, type Socket } from 'socket.io-client';
import type { Attachment, AttachmentInput, Conversation, Message, MessageInfo, MessageStatus } from '~/types';

// Estado que não precisa ser reativo vive fora do composable (uma única conexão por aba).
let socket: Socket | null = null;
let listenersBound = false;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
let lastTypingEmit = 0;
let stopTypingTimer: ReturnType<typeof setTimeout> | undefined;

// Compartilhamento de localização ao vivo: sobrevive à troca de conversa (como no WhatsApp).
let liveWatchId: number | null = null;
let lastLocationEmit = 0;
let liveShareTimeout: ReturnType<typeof setTimeout> | undefined;

const STATUS_ORDER: Record<string, number> = { pending: 0, failed: 0, sent: 1, delivered: 2, read: 3 };

/** Converte o anexo "de exibição" (o que a bolha mostra) para o formato que o servidor espera ao enviar. */
function toWireAttachment(a: Attachment): AttachmentInput {
  if (a.type === 'LOCATION') return { kind: 'location', latitude: a.latitude!, longitude: a.longitude!, liveUntil: a.liveUntil ?? null };
  if (a.type === 'CONTACT') return { kind: 'contact', contactUserId: a.contactUserId! };
  if (a.type === 'STICKER') return { kind: 'sticker', id: a.name! };
  return { kind: 'media', type: a.type, url: a.url!, mime: a.mime!, name: a.name!, size: a.size! };
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocalização não é suportada neste navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        reject(new Error(err.code === err.PERMISSION_DENIED ? 'Permissão de localização negada.' : 'Não foi possível obter sua localização.'));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  });
}

export function useChat() {
  const { api, token, me, logout } = useAuth();

  const conversations = useState<Conversation[]>('chat.conversations', () => []);
  const messages = useState<Record<string, Message[]>>('chat.messages', () => ({}));
  const hasMore = useState<Record<string, boolean>>('chat.hasMore', () => ({}));
  const activeId = useState<string | null>('chat.active', () => null);
  const typing = useState<Record<string, string[]>>('chat.typing', () => ({}));
  const online = useState<Record<string, boolean>>('chat.online', () => ({}));
  const connected = useState<boolean>('chat.connected', () => false);
  const liveShare = useState<{ conversationId: string; messageId: string; until: number } | null>('chat.liveShare', () => null);

  // -------------------------------------------------------------------------
  // Consultas auxiliares
  // -------------------------------------------------------------------------

  const activeConversation = computed(() => findConversation(activeId.value ?? '') ?? null);

  // Também procura entre as arquivadas: dá pra abrir uma conversa arquivada direto da lista.
  function findConversation(id: string) {
    return conversations.value.find((c) => c.id === id) ?? archivedConversations.value.find((c) => c.id === id);
  }

  /** Conversa "Você": 1:1 consigo mesmo (só um participante). */
  function isSelfChat(conv: Conversation) {
    return conv.type === 'DIRECT' && conv.participants.length === 1 && conv.participants[0]?.userId === me.value?.id;
  }

  function otherUser(conv: Conversation) {
    if (isSelfChat(conv)) return conv.participants[0]?.user ?? null;
    return conv.participants.find((p) => p.userId !== me.value?.id)?.user ?? null;
  }

  function conversationTitle(conv: Conversation) {
    if (conv.type === 'GROUP') return conv.title ?? 'Grupo';
    if (isSelfChat(conv)) return `${me.value?.displayName ?? 'Você'} (você)`;
    return otherUser(conv)?.displayName ?? 'Conversa';
  }

  function userName(conv: Conversation, userId: string) {
    if (userId === me.value?.id) return 'Você';
    return conv.participants.find((p) => p.userId === userId)?.user.displayName ?? 'Alguém';
  }

  /** Texto de apoio no cabeçalho: digitando, online, visto por último ou lista de participantes. */
  function subtitle(conv: Conversation) {
    const typingIds = typing.value[conv.id] ?? [];
    if (isSelfChat(conv)) return 'Envie mensagens para você mesmo';
    if (conv.type === 'DIRECT') {
      if (typingIds.length) return 'digitando…';
      const other = otherUser(conv);
      if (!other) return '';
      return online.value[other.id] ? 'online' : formatLastSeen(other.lastSeenAt);
    }
    if (typingIds.length) {
      const names = typingIds.map((id) => userName(conv, id).split(' ')[0]);
      return `${names.join(', ')} ${names.length > 1 ? 'estão digitando…' : 'está digitando…'}`;
    }
    return conv.participants.map((p) => (p.userId === me.value?.id ? 'Você' : p.user.displayName.split(' ')[0])).join(', ');
  }

  const ATTACHMENT_LABELS: Record<string, string> = {
    IMAGE: '📷 Foto',
    VIDEO: '🎥 Vídeo',
    AUDIO: '🎤 Mensagem de voz',
    FILE: '📄 Arquivo',
    LOCATION: '📍 Localização',
    CONTACT: '👤 Contato',
    STICKER: '💟 Figurinha',
  };

  const VIEW_ONCE_LABELS: Record<string, string> = {
    IMAGE: 'Foto de visualização única',
    VIDEO: 'Vídeo de visualização única',
    AUDIO: 'Áudio de visualização única',
  };

  function previewText(conv: Conversation) {
    const last = conv.lastMessage;
    if (!last) return 'Nenhuma mensagem ainda';
    if (last.deleted) return 'Mensagem apagada';
    if (last.viewOnce) {
      const prefix = last.senderId !== me.value?.id && conv.type === 'GROUP' ? `${userName(conv, last.senderId).split(' ')[0]}: ` : '';
      return prefix + (last.opened ? 'Aberta' : (VIEW_ONCE_LABELS[last.attachment?.type ?? ''] ?? 'Visualização única'));
    }
    // Minha: sem "Você:" — o card mostra os ✓ antes do texto.
    const mine = last.senderId === me.value?.id;
    const prefix = mine ? '' : conv.type === 'GROUP' ? `${userName(conv, last.senderId).split(' ')[0]}: ` : '';
    const body = last.body || (last.attachment ? ATTACHMENT_LABELS[last.attachment.type] : '');
    return prefix + body;
  }

  // -------------------------------------------------------------------------
  // Conversas
  // -------------------------------------------------------------------------

  function sortConversations() {
    conversations.value = [...conversations.value].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
  }

  function upsertConversation(conv: Conversation) {
    const index = conversations.value.findIndex((c) => c.id === conv.id);
    if (index >= 0) conversations.value[index] = conv;
    else conversations.value.push(conv);
    sortConversations();
  }

  async function loadConversations() {
    // Lista da última vez na tela imediatamente; a do servidor substitui quando chegar.
    if (!conversations.value.length) {
      const cached = readCache<Conversation[]>('zynko.conversations');
      if (cached?.length) conversations.value = cached;
    }
    const res = await api<{ conversations: Conversation[] }>('/conversations');
    conversations.value = res.conversations;
  }
  if (import.meta.client && !(globalThis as { __zynkoConvCache?: boolean }).__zynkoConvCache) {
    (globalThis as { __zynkoConvCache?: boolean }).__zynkoConvCache = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(
      conversations,
      (list) => {
        clearTimeout(timer);
        timer = setTimeout(() => writeCache('zynko.conversations', list.slice(0, 60)), 1500);
      },
      { deep: true },
    );
  }

  async function fetchConversation(id: string) {
    try {
      const res = await api<{ conversation: Conversation }>(`/conversations/${id}`);
      // Arquivada: atualiza só nas arquivadas (não pode "vazar" para a lista principal).
      const archivedIndex = archivedConversations.value.findIndex((c) => c.id === id);
      if (res.conversation.archived && archivedIndex >= 0) {
        archivedConversations.value[archivedIndex] = res.conversation;
        return;
      }
      upsertConversation(res.conversation);
    } catch {
      // Sem acesso (removido do grupo, por exemplo): some da lista.
      removeConversation(id);
    }
  }

  function removeConversation(id: string) {
    conversations.value = conversations.value.filter((c) => c.id !== id);
    delete messages.value[id];
    if (activeId.value === id) activeId.value = null;
  }

  /** Abre (ou cria) a conversa 1:1 com um contato (por id) ou com qualquer número que use o Chat. */
  async function createDirect(target: string | { phone: string }) {
    const body = typeof target === 'string' ? { userId: target } : { phone: target.phone };
    const res = await api<{ conversation: Conversation }>('/conversations/direct', { method: 'POST', body });
    upsertConversation(res.conversation);
    await openConversation(res.conversation.id);
  }

  /** "Adicionar" no aviso de número desconhecido: salva a outra pessoa da conversa 1:1 nos contatos. */
  async function addPeerToContacts(conversationId: string, name?: string) {
    const conv = conversations.value.find((c) => c.id === conversationId);
    const peer = conv ? otherUser(conv) : null;
    if (!conv || !peer) return;
    const [firstName, ...rest] = (name ?? '').trim().split(/\s+/);
    await api('/contacts', {
      method: 'POST',
      body: { query: conv.peerPhone ?? peer.username, firstName: firstName || undefined, lastName: rest.join(' ') || undefined },
    });
    conv.peerIsContact = true;
    // Busca de novo: o nome salvo passa a aparecer no lugar do número (topo, lista e mensagens).
    await fetchConversation(conversationId);
    contactsVersion.value++;
  }

  async function createGroup(title: string, memberIds: string[]) {
    const res = await api<{ conversation: Conversation }>('/conversations/group', {
      method: 'POST',
      body: { title, memberIds },
    });
    upsertConversation(res.conversation);
    await openConversation(res.conversation.id);
  }

  async function renameGroup(id: string, title: string) {
    const res = await api<{ conversation: Conversation }>(`/conversations/${id}`, { method: 'PATCH', body: { title } });
    upsertConversation(res.conversation);
  }

  async function addMembers(id: string, userIds: string[]) {
    const res = await api<{ conversation: Conversation }>(`/conversations/${id}/members`, {
      method: 'POST',
      body: { userIds },
    });
    upsertConversation(res.conversation);
  }

  async function removeMember(id: string, userId: string) {
    await api(`/conversations/${id}/members/${userId}`, { method: 'DELETE' });
    if (userId === me.value?.id) removeConversation(id);
    else await fetchConversation(id);
  }

  // -------------------------------------------------------------------------
  // Ações da conversa (arquivar, fixar, favoritar, silenciar, limpar, apagar, bloquear)
  // -------------------------------------------------------------------------

  const archivedConversations = useState<Conversation[]>('chat.archivedConversations', () => []);

  async function loadArchived() {
    const res = await api<{ conversations: Conversation[] }>('/conversations', { query: { archived: true } });
    archivedConversations.value = res.conversations;
  }

  type ConversationPrefsPatch = Partial<{
    archived: boolean;
    pinned: boolean;
    favorited: boolean;
    forcedUnread: boolean;
    muteMinutes: number | null;
  }>;

  async function setConversationPrefs(id: string, patch: ConversationPrefsPatch) {
    const res = await api<{ conversation: Conversation }>(`/conversations/${id}/prefs`, { method: 'PATCH', body: patch });
    if (patch.archived === true) {
      conversations.value = conversations.value.filter((c) => c.id !== id);
      archivedConversations.value = [res.conversation, ...archivedConversations.value.filter((c) => c.id !== id)];
    } else if (patch.archived === false) {
      archivedConversations.value = archivedConversations.value.filter((c) => c.id !== id);
      upsertConversation(res.conversation);
    } else if (res.conversation.archived) {
      // Silenciar/fixar/favoritar uma arquivada: atualiza só nas arquivadas (não pode aparecer na lista principal).
      const archivedIndex = archivedConversations.value.findIndex((c) => c.id === id);
      if (archivedIndex >= 0) archivedConversations.value[archivedIndex] = res.conversation;
    } else {
      upsertConversation(res.conversation);
    }
    return res.conversation;
  }

  /** "Limpar conversa": apaga o histórico só para mim. */
  async function clearConversationHistory(id: string) {
    await api(`/conversations/${id}/clear`, { method: 'POST' });
    messages.value[id] = [];
    hasMore.value[id] = false;
    const conv = findConversation(id);
    if (conv) conv.lastMessage = null;
  }

  /** "Apagar conversa" (1:1): some da minha lista; reaparece se chegar mensagem nova. */
  async function hideConversation(id: string) {
    await api(`/conversations/${id}`, { method: 'DELETE' });
    removeConversation(id);
    archivedConversations.value = archivedConversations.value.filter((c) => c.id !== id);
  }

  async function blockUser(userId: string, conversationId?: string) {
    await api(`/contacts/${userId}/block`, { method: 'POST' });
    if (conversationId) {
      const conv = findConversation(conversationId);
      if (conv) conv.youBlocked = true;
    }
  }

  async function unblockUser(userId: string, conversationId?: string) {
    await api(`/contacts/${userId}/block`, { method: 'DELETE' });
    if (conversationId) {
      const conv = findConversation(conversationId);
      if (conv) conv.youBlocked = false;
    }
  }

  // -------------------------------------------------------------------------
  // Mensagens
  // -------------------------------------------------------------------------

  /** Insere ou atualiza uma mensagem. Se vier com clientId, substitui a bolha "enviando…" correspondente. */
  function upsertMessage(m: Message) {
    const list = messages.value[m.conversationId];
    if (!list) return;
    let index = list.findIndex((x) => x.id === m.id);
    if (index === -1 && m.clientId) index = list.findIndex((x) => x.clientId === m.clientId);
    if (index >= 0) {
      list[index] = { ...list[index], ...m };
    } else {
      list.push(m);
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  }

  async function loadMessages(id: string, before?: string) {
    const res = await api<{ messages: Message[]; hasMore: boolean }>(`/conversations/${id}/messages`, {
      query: { limit: 40, before },
    });
    const existing = messages.value[id] ?? [];
    if (before) {
      messages.value[id] = [...res.messages, ...existing];
      hasMore.value[id] = res.hasMore;
      return;
    }
    // Carga mais recente: mantém o que já estava carregado antes dela e as mensagens ainda não confirmadas.
    const firstNew = res.messages[0]?.createdAt;
    const confirmed = (m: Message) => m.status !== 'pending' && m.status !== 'failed';
    const older = firstNew ? existing.filter((m) => confirmed(m) && m.createdAt < firstNew) : [];
    const unsent = existing.filter((m) => !confirmed(m) && !res.messages.some((r) => r.id === m.id));
    messages.value[id] = [...older, ...res.messages, ...unsent];
    if (!older.length) hasMore.value[id] = res.hasMore;
  }

  async function loadOlder(id: string) {
    const first = messages.value[id]?.find((m) => !m.id.startsWith('tmp-'));
    if (!first || !hasMore.value[id]) return;
    await loadMessages(id, first.createdAt);
  }

  /** Muda quando a lista de contatos muda no servidor (alguém salvo entrou no Chat). */
  const contactsVersion = useState('chat.contactsVersion', () => 0);

  /** Mensagem a destacar (resultado da pesquisa): a conversa rola até ela. */
  const jumpTarget = useState<string | null>('chat.jumpTarget', () => null);

  /** Garante que a mensagem esteja carregada (busca páginas antigas se preciso) e pede para rolar até ela. */
  async function jumpToMessage(conversationId: string, messageId: string) {
    for (let i = 0; i < 30; i++) {
      if (messages.value[conversationId]?.some((m) => m.id === messageId)) break;
      if (!hasMore.value[conversationId]) break;
      await loadOlder(conversationId);
    }
    jumpTarget.value = null;
    await nextTick();
    jumpTarget.value = messageId;
  }

  function markRead(id: string) {
    const conv = findConversation(id);
    if (conv) conv.unreadCount = 0;
    if (socket?.connected) socket.emit('conversation:read', { conversationId: id });
    else void api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
  }

  async function openConversation(id: string) {
    activeId.value = id;
    if (!messages.value[id]) {
      try {
        await loadMessages(id);
      } catch {
        messages.value[id] = [];
      }
    }
    if (findConversation(id)?.unreadCount) markRead(id);
  }

  function closeConversation() {
    activeId.value = null;
  }

  function bumpConversation(conv: Conversation, m: Message) {
    conv.lastMessage = m;
    conv.lastMessageAt = m.createdAt;
    // Mensagem nova: o servidor desarquiva automaticamente quem tinha escondido a conversa.
    if (conv.archived) {
      conv.archived = false;
      archivedConversations.value = archivedConversations.value.filter((c) => c.id !== conv.id);
      if (!conversations.value.some((c) => c.id === conv.id)) conversations.value.push(conv);
    }
    sortConversations();
  }

  // Envio como no WhatsApp: sem internet = falhou (!); internet instável = relógio, e o app continua
  // tentando sozinho (a cada reconexão e de tempos em tempos) por até 2 minutos.
  const GIVE_UP_MS = 2 * 60_000;
  const firstTry = new Map<string, number>();
  function transmit(temp: Message) {
    const item = () => messages.value[temp.conversationId]?.find((x) => x.clientId === temp.clientId);
    const fail = () => {
      const m = item();
      if (m && m.status === 'pending') m.status = 'failed';
    };
    const started = firstTry.get(temp.clientId!) ?? Date.now();
    firstTry.set(temp.clientId!, started);
    if (!navigator.onLine || Date.now() - started > GIVE_UP_MS) return fail();
    // Sem conexão com o servidor agora: fica "enviando" e sai quando reconectar (flushPending).
    if (!socket?.connected) return;

    socket.timeout(10_000).emit(
      'message:send',
      {
        conversationId: temp.conversationId,
        body: temp.body,
        replyToId: temp.replyTo?.id ?? null,
        clientId: temp.clientId,
        attachment: temp.attachment ? toWireAttachment(temp.attachment) : null,
        forwarded: temp.forwarded || undefined,
        viewOnce: temp.viewOnce || undefined,
      },
      (err: Error | null, res?: { ok: boolean; message?: Message }) => {
        if (res && !res.ok) return fail(); // Recusada pelo servidor (bloqueado etc.): não adianta repetir.
        if (err || !res?.message) {
          // Demorou (rede ruim): tenta de novo daqui a pouco, se ainda estiver pendente.
          setTimeout(() => {
            if (item()?.status === 'pending') transmit(temp);
          }, 3000);
          return;
        }
        firstTry.delete(temp.clientId!);
        upsertMessage({ ...res.message, clientId: temp.clientId });
      },
    );
  }

  function send(
    conversationId: string,
    body: string,
    replyTo: Message | null = null,
    attachment: Attachment | null = null,
    opts: { forwarded?: boolean; viewOnce?: boolean } = {},
  ) {
    if (!me.value) return;
    const clientId = newId();
    const temp: Message = {
      id: `tmp-${clientId}`,
      clientId,
      conversationId,
      senderId: me.value.id,
      body,
      deleted: false,
      createdAt: new Date().toISOString(),
      editedAt: null,
      attachment,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderId: replyTo.senderId,
            body: replyTo.viewOnce ? '' : replyTo.body.slice(0, 200),
            deleted: false,
            viewOnce: replyTo.viewOnce,
            attachment: replyTo.attachment
              ? replyTo.viewOnce
                ? { type: replyTo.attachment.type }
                : { type: replyTo.attachment.type, url: replyTo.attachment.url, name: replyTo.attachment.name, mime: replyTo.attachment.mime }
              : null,
          }
        : null,
      status: 'pending',
      forwarded: !!opts.forwarded,
      viewOnce: opts.viewOnce || undefined,
    };
    (messages.value[conversationId] ??= []).push(temp);
    const conv = findConversation(conversationId);
    if (conv) bumpConversation(conv, temp);
    transmit(temp);
  }

  function retry(m: Message) {
    const item = messages.value[m.conversationId]?.find((x) => x.id === m.id);
    if (!item) return;
    item.status = 'pending';
    if (item.clientId) firstTry.delete(item.clientId);
    transmit(item);
  }

  /** Reconectou: manda o que ficou pendente (relógio) e tenta de novo o que falhou por falta de internet. */
  function flushPending() {
    for (const list of Object.values(messages.value)) {
      for (const m of list) {
        if (!m.clientId || !m.id.startsWith('tmp-') || m.attachment) continue;
        if (m.status === 'failed') retry(m);
        else if (m.status === 'pending') transmit(m);
      }
    }
  }
  if (import.meta.client && !(globalThis as { __zynkoOffline?: boolean }).__zynkoOffline) {
    (globalThis as { __zynkoOffline?: boolean }).__zynkoOffline = true;
    // Caiu a internet: o que estava "enviando" vira falha (!) na hora.
    window.addEventListener('offline', () => {
      for (const list of Object.values(messages.value)) for (const m of list) if (m.status === 'pending' && !m.attachment) m.status = 'failed';
    });
  }

  /** Como send(), mas espera a confirmação do servidor e devolve o id real da mensagem (precisa disso para a localização ao vivo). */
  function sendTracked(conversationId: string, attachment: Attachment): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!me.value) return reject(new Error('Não autenticado'));
      if (!socket?.connected) return reject(new Error('Sem conexão com o servidor'));
      const clientId = newId();
      const temp: Message = {
        id: `tmp-${clientId}`,
        clientId,
        conversationId,
        senderId: me.value.id,
        body: '',
        deleted: false,
        createdAt: new Date().toISOString(),
        editedAt: null,
        attachment,
        replyTo: null,
        status: 'pending',
      };
      (messages.value[conversationId] ??= []).push(temp);
      const conv = findConversation(conversationId);
      if (conv) bumpConversation(conv, temp);

      socket.timeout(10_000).emit(
        'message:send',
        { conversationId, body: '', replyToId: null, clientId, attachment: toWireAttachment(attachment) },
        (err: Error | null, res?: { ok: boolean; message?: Message; error?: string }) => {
          if (err || !res?.ok || !res.message) {
            temp.status = 'failed';
            reject(new Error(res?.error ?? 'Falha ao enviar'));
            return;
          }
          upsertMessage({ ...res.message, clientId });
          resolve(res.message.id);
        },
      );
    });
  }

  async function editMessage(m: Message, body: string) {
    const res = await api<{ message: Message }>(`/messages/${m.id}`, { method: 'PATCH', body: { body } });
    handleMessageUpdated(res.message);
  }

  /** scope 'all' = apagar para todos (com prazo; master sem prazo); 'me' = só some para mim. */
  async function deleteMessage(m: Message, scope: 'all' | 'me' = 'all') {
    await api(`/messages/${m.id}`, { method: 'DELETE', query: { scope } });
    if (scope === 'me') removeLocal(m.conversationId, m.id);
    else if (liveShare.value?.messageId === m.id) stopLiveLocation();
  }

  function removeLocal(conversationId: string, messageId: string) {
    const list = messages.value[conversationId];
    if (list) messages.value[conversationId] = list.filter((x) => x.id !== messageId);
  }

  /** "Apagar para todos" ainda vale? Própria mensagem dentro do prazo; o master sempre. */
  function canDeleteForAll(m: Message) {
    if (m.deleted || m.id.startsWith('tmp-')) return false;
    if (me.value?.isMaster) return true;
    const limit = (me.value?.deleteForAllMinutes ?? 60) * 60_000;
    return m.senderId === me.value?.id && Date.now() - new Date(m.createdAt).getTime() <= limit;
  }

  async function setStar(m: Message, starred: boolean) {
    await api(`/messages/${m.id}/star`, { method: starred ? 'PUT' : 'DELETE' });
    const item = messages.value[m.conversationId]?.find((x) => x.id === m.id);
    if (item) item.starred = starred;
  }

  async function pinMessage(conversationId: string, messageId: string | null) {
    await api(`/conversations/${conversationId}/pin`, { method: 'PUT', body: { messageId } });
    await fetchConversation(conversationId);
  }

  function messageInfo(m: Message) {
    return api<MessageInfo>(`/messages/${m.id}/info`);
  }

  /** Visualização única: busca a mídia (só funciona uma vez) e já marca como aberta aqui. */
  async function openViewOnce(m: Message) {
    const res = await api<{ body: string; attachment: Attachment }>(`/messages/${m.id}/open`, { method: 'POST' });
    const item = messages.value[m.conversationId]?.find((x) => x.id === m.id);
    if (item) item.opened = true;
    const conv = findConversation(m.conversationId);
    if (conv?.lastMessage?.id === m.id) conv.lastMessage = { ...conv.lastMessage, opened: true };
    return res;
  }

  /** Visualização única dá para usar aqui? Só com mais alguém na conversa (não na "você mesmo" nem em grupo só seu). */
  function canViewOnce(conv: Conversation) {
    return !isSelfChat(conv) && conv.participants.some((p) => p.userId !== me.value?.id);
  }

  /** Encaminhar: reenvia texto/anexo para cada conversa escolhida, marcado como "Encaminhada". */
  function forward(m: Message, conversationIds: string[]) {
    for (const id of conversationIds) send(id, m.body, null, m.attachment, { forwarded: true });
  }

  // -------------------------------------------------------------------------
  // Localização
  // -------------------------------------------------------------------------

  /** Envia a posição atual uma única vez. */
  async function sendCurrentLocation(conversationId: string) {
    const pos = await getCurrentPosition();
    const attachment: Attachment = {
      type: 'LOCATION',
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      liveUntil: null,
    };
    send(conversationId, '', null, attachment);
  }

  /** Começa a compartilhar a posição ao vivo por `minutes` minutos (só um compartilhamento por vez). */
  async function startLiveLocation(conversationId: string, minutes: number) {
    if (liveShare.value) stopLiveLocation();
    const pos = await getCurrentPosition();
    const until = Date.now() + minutes * 60_000;
    const attachment: Attachment = {
      type: 'LOCATION',
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      liveUntil: new Date(until).toISOString(),
    };
    const messageId = await sendTracked(conversationId, attachment);
    liveShare.value = { conversationId, messageId, until };

    liveWatchId = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - lastLocationEmit < 8000) return;
        lastLocationEmit = now;
        socket?.emit('location:update', { messageId, latitude: p.coords.latitude, longitude: p.coords.longitude });
      },
      () => {
        /* mantém a última posição conhecida se uma leitura falhar */
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    clearTimeout(liveShareTimeout);
    liveShareTimeout = setTimeout(() => {
      if (liveShare.value?.messageId === messageId) stopLiveLocation();
    }, until - Date.now() + 2000);
  }

  /** Encerra o compartilhamento de localização ao vivo em andamento (se houver). */
  function stopLiveLocation() {
    if (liveWatchId !== null) {
      navigator.geolocation.clearWatch(liveWatchId);
      liveWatchId = null;
    }
    clearTimeout(liveShareTimeout);
    const share = liveShare.value;
    liveShare.value = null;
    if (share) socket?.emit('location:stop', { messageId: share.messageId });
  }

  async function sendContact(conversationId: string, user: { id: string; displayName: string; username: string }) {
    const attachment: Attachment = {
      type: 'CONTACT',
      contactUserId: user.id,
      contactName: user.displayName,
      contactUsername: user.username,
    };
    send(conversationId, '', null, attachment);
  }

  // -------------------------------------------------------------------------
  // "Digitando…"
  // -------------------------------------------------------------------------

  function notifyTyping(conversationId: string) {
    if (!socket?.connected) return;
    const now = Date.now();
    if (now - lastTypingEmit > 2500) {
      socket.emit('typing', { conversationId, isTyping: true });
      lastTypingEmit = now;
    }
    clearTimeout(stopTypingTimer);
    stopTypingTimer = setTimeout(() => stopTyping(conversationId), 3500);
  }

  function stopTyping(conversationId: string) {
    clearTimeout(stopTypingTimer);
    if (lastTypingEmit && socket?.connected) socket.emit('typing', { conversationId, isTyping: false });
    lastTypingEmit = 0;
  }

  function setTypingState(conversationId: string, userId: string, isTyping: boolean) {
    const key = `${conversationId}:${userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.delete(key);
    const current = (typing.value[conversationId] ?? []).filter((id) => id !== userId);
    if (isTyping) {
      current.push(userId);
      // Se o aviso de "parou de digitar" se perder, expira sozinho.
      typingTimers.set(key, setTimeout(() => setTypingState(conversationId, userId, false), 6000));
    }
    typing.value[conversationId] = current;
  }

  // -------------------------------------------------------------------------
  // Eventos do servidor
  // -------------------------------------------------------------------------

  function notifyDesktop(conv: Conversation, m: Message) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    if (conv.mutedUntil && new Date(conv.mutedUntil).getTime() > Date.now()) return;
    const n = new Notification(conversationTitle(conv), { body: m.body.slice(0, 120), tag: conv.id, icon: '/icon-192.png' });
    n.onclick = () => {
      window.focus();
      void openConversation(conv.id);
    };
  }

  async function handleMessageNew(m: Message) {
    upsertMessage(m);
    const conv = findConversation(m.conversationId);
    if (!conv) {
      // Conversa nova (alguém começou um papo ou me adicionou a um grupo).
      await fetchConversation(m.conversationId);
      return;
    }
    bumpConversation(conv, m);
    if (m.senderId === me.value?.id) return;
    setTypingState(m.conversationId, m.senderId, false);
    if (activeId.value === conv.id && document.visibilityState === 'visible') {
      markRead(conv.id);
    } else {
      conv.unreadCount += 1;
      notifyDesktop(conv, m);
    }
  }

  function handleMessageUpdated(m: Message) {
    upsertMessage(m);
    const conv = findConversation(m.conversationId);
    if (conv?.lastMessage?.id === m.id) conv.lastMessage = { ...conv.lastMessage, ...m };
  }

  function handleStatus(payload: { conversationId: string; updates: { id: string; status: MessageStatus }[] }) {
    const list = messages.value[payload.conversationId] ?? [];
    const conv = findConversation(payload.conversationId);
    for (const update of payload.updates) {
      // O status só avança (enviada → entregue → lida), nunca volta.
      for (const target of [list.find((m) => m.id === update.id), conv?.lastMessage?.id === update.id ? conv.lastMessage : undefined]) {
        if (target && (STATUS_ORDER[update.status] ?? 0) > (STATUS_ORDER[target.status ?? 'sent'] ?? 0)) {
          target.status = update.status;
        }
      }
    }
  }

  async function refreshAfterConnect() {
    try {
      await loadConversations();
      const id = activeId.value;
      if (id && findConversation(id)) {
        await loadMessages(id);
        if (document.visibilityState === 'visible') markRead(id);
      }
    } catch {
      /* a próxima reconexão tenta de novo */
    }
  }

  function bindListeners(s: Socket) {
    s.on('connect', () => {
      connected.value = true;
      void refreshAfterConnect();
      flushPending();
    });
    s.on('disconnect', () => {
      connected.value = false;
    });
    s.on('connect_error', (error: Error) => {
      // Antes de desconectar a pessoa, confirma pela API: só um 401 de verdade apaga o login
      // (api() já faz o logout nesse caso). Erro passageiro: o socket tenta de novo sozinho.
      if (error.message === 'unauthorized') void useAuth().api('/me').catch(() => {});
    });

    s.on('presence:init', (p: { online: string[] }) => {
      online.value = Object.fromEntries(p.online.map((id) => [id, true]));
    });
    s.on('presence', (p: { userId: string; online: boolean; lastSeenAt?: string }) => {
      online.value[p.userId] = p.online;
      if (p.lastSeenAt) {
        for (const conv of conversations.value) {
          const participant = conv.participants.find((x) => x.userId === p.userId);
          if (participant) participant.user.lastSeenAt = p.lastSeenAt;
        }
      }
    });

    s.on('message:new', (m: Message) => void handleMessageNew(m));
    s.on('message:updated', (m: Message) => handleMessageUpdated(m));
    // "Apagar para mim" feito em outro aparelho meu.
    s.on('message:removed', (p: { conversationId: string; messageId: string }) => removeLocal(p.conversationId, p.messageId));
    s.on('message:status', handleStatus);
    s.on('typing', (p: { conversationId: string; userId: string; isTyping: boolean }) =>
      setTypingState(p.conversationId, p.userId, p.isTyping),
    );
    s.on('conversation:updated', (p: { conversationId: string }) => void fetchConversation(p.conversationId));
    // Um número que você salvou entrou no Chat: avisa quem estiver ouvindo (ex.: painel Nova conversa).
    s.on('contacts:changed', () => {
      contactsVersion.value++;
    });
    // Mensagens temporárias vencidas: somem para todos.
    s.on('messages:expired', (p: { conversationId: string; messageIds: string[] }) => {
      const list = messages.value[p.conversationId];
      if (!list) return;
      const gone = new Set(p.messageIds);
      messages.value[p.conversationId] = list.filter((m) => !gone.has(m.id));
    });
    s.on('conversation:removed', (p: { conversationId: string }) => removeConversation(p.conversationId));
    s.on('conversation:read', (p: { conversationId: string }) => {
      const conv = findConversation(p.conversationId);
      if (conv) conv.unreadCount = 0;
    });
  }

  function connect() {
    if (socket) return;
    // Em dev o front roda em outra porta (3000); conecta direto na API (3001) em vez de
    // passar pelo proxy de WebSocket do Nitro, que é instável no modo dev.
    const url = import.meta.dev ? 'http://127.0.0.1:3001' : undefined;
    socket = io(url, {
      // Função: a cada (re)conexão envia o token atual.
      auth: (cb) => cb({ token: token.value }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    bindListeners(socket);
    bindCallListeners(socket);

    if (!listenersBound) {
      listenersBound = true;
      // Celular: em segundo plano o sistema derruba a conexão, mas o socket só percebe no próximo "ping"
      // (até ~45 s, com "conectando…" na tela). Voltou depois de um tempo: reconecta na hora.
      let hiddenAt = 0;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now();
          return;
        }
        if (socket && hiddenAt && Date.now() - hiddenAt > 15_000) {
          socket.disconnect();
          socket.connect();
        }
        hiddenAt = 0;
      });
      // Voltou para a aba com a conversa aberta: marca como lida.
      document.addEventListener('visibilitychange', () => {
        const id = activeId.value;
        if (document.visibilityState === 'visible' && id && findConversation(id)?.unreadCount) markRead(id);
      });
    }
  }

  function disconnect() {
    socket?.disconnect();
    socket = null;
    connected.value = false;
  }

  /** Limpa tudo (logout). */
  function reset() {
    stopLiveLocation();
    disconnect();
    conversations.value = [];
    archivedConversations.value = [];
    messages.value = {};
    hasMore.value = {};
    typing.value = {};
    online.value = {};
    activeId.value = null;
  }

  return {
    // estado
    conversations,
    archivedConversations,
    messages,
    findConversation,
    upsertConversation,
    jumpTarget,
    contactsVersion,
    jumpToMessage,
    getSocket: () => socket,
    hasMore,
    activeId,
    activeConversation,
    typing,
    online,
    connected,
    liveShare,
    // consultas
    otherUser,
    isSelfChat,
    conversationTitle,
    userName,
    subtitle,
    previewText,
    // ações
    connect,
    disconnect,
    reset,
    loadConversations,
    openConversation,
    canDeleteForAll,
    setStar,
    pinMessage,
    messageInfo,
    forward,
    openViewOnce,
    canViewOnce,
    closeConversation,
    loadOlder,
    markRead,
    send,
    retry,
    editMessage,
    deleteMessage,
    notifyTyping,
    stopTyping,
    createDirect,
    addPeerToContacts,
    createGroup,
    renameGroup,
    addMembers,
    removeMember,
    sendCurrentLocation,
    startLiveLocation,
    stopLiveLocation,
    sendContact,
    loadArchived,
    setConversationPrefs,
    clearConversationHistory,
    hideConversation,
    blockUser,
    unblockUser,
  };
}
