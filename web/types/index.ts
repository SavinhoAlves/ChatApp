export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  /** Conta comercial (selo "Conta comercial" e perfil da empresa). */
  isBusiness?: boolean;
  /** Nome do perfil quando `displayName` é o nome que você salvou nos contatos. */
  profileName?: string;
  /** Só vem no próprio perfil (/me) e na lista de bloqueados. */
  phone?: string | null;
  lastSeenAt: string;
}

// 'pending' e 'failed' existem só no app (mensagem ainda não confirmada pelo servidor).
export type MessageStatus = 'pending' | 'failed' | 'sent' | 'delivered' | 'read';

export interface ReplyPreview {
  id: string;
  senderId: string;
  body: string;
  deleted: boolean;
}

export type AttachmentType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'LOCATION' | 'CONTACT' | 'STICKER';

export interface Attachment {
  type: AttachmentType;
  // Mídia (IMAGE, VIDEO, AUDIO, FILE)
  url?: string;
  mime?: string;
  name?: string;
  size?: number;
  // Localização (atual ou ao vivo)
  latitude?: number;
  longitude?: number;
  liveUntil?: string | null;
  // Contato compartilhado
  contactUserId?: string;
  contactName?: string;
  contactUsername?: string;
}

/** O que o app manda ao enviar uma mensagem com anexo (ver AttachmentInput no servidor). */
export type AttachmentInput =
  | { kind: 'media'; type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'; url: string; mime: string; name: string; size: number }
  | { kind: 'location'; latitude: number; longitude: number; liveUntil?: string | null }
  | { kind: 'contact'; contactUserId: string }
  | { kind: 'sticker'; id: string };

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  /** Mensagem temporária: some para todos neste horário. */
  expiresAt?: string | null;
  attachment: Attachment | null;
  replyTo: ReplyPreview | null;
  status: MessageStatus | null;
  clientId?: string;
}

export interface Participant {
  userId: string;
  role: 'ADMIN' | 'MEMBER';
  user: User;
}

export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  participants: Participant[];
  lastMessage: Message | null;
  unreadCount: number;
  archived: boolean;
  pinned: boolean;
  favorited: boolean;
  mutedUntil: string | null;
  youBlocked: boolean;
  /** Mensagens temporárias (segundos) ou null se desativado. */
  disappearSeconds: number | null;
  /** Conversa 1:1: a outra pessoa está nos meus contatos? Se não, mostra o aviso Bloquear / Adicionar. */
  peerIsContact: boolean;
  peerPhone: string | null;
}

export interface Device {
  id: string;
  deviceName: string;
  platform: 'mobile' | 'desktop' | 'web';
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}
