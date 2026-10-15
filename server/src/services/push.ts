import { sign } from 'node:crypto';
import webpush from 'web-push';
import { readFileSync } from 'node:fs';
import { connect, type ClientHttp2Session } from 'node:http2';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { displayPhone, savedName } from './contacts.js';

/**
 * Notificações nativas, sem bibliotecas:
 * - iPhone pelo APNs (Apple): HTTP/2 + token JWT (ES256) assinado com a chave .p8 (APNS_* no .env);
 * - Android pelo FCM (Firebase): API HTTP v1 com token OAuth da conta de serviço (FCM_SERVICE_ACCOUNT_FILE).
 * O que não estiver configurado simplesmente não envia.
 *
 * O app em primeiro plano não mostra o aviso (presentationOptions vazio no capacitor.config.ts),
 * então dá para enviar sempre: só aparece quando o app está fechado ou em segundo plano.
 */

const { keyId, teamId, keyFile, bundleId, host } = config.apns;

function loadKey() {
  if (!keyId || !teamId || !keyFile) return null;
  try {
    return readFileSync(keyFile, 'utf8');
  } catch {
    // Chave configurada mas arquivo ausente: o servidor segue no ar, só sem notificações.
    console.error(`APNs desativado: não foi possível ler APNS_KEY_FILE (${keyFile})`);
    return null;
  }
}
const signingKey = loadKey();

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
function loadServiceAccount(): ServiceAccount | null {
  const file = config.fcm.serviceAccountFile;
  if (!file) return null;
  try {
    const sa = JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount;
    if (sa.project_id && sa.client_email && sa.private_key) return sa;
  } catch {
    // cai no aviso abaixo
  }
  console.error(`FCM desativado: não foi possível ler a conta de serviço (${file})`);
  return null;
}
const fcmAccount = loadServiceAccount();

// Web Push (PWA instalado no iPhone pelo Safari, Chrome, Edge...): padrão aberto com chaves VAPID.
const { publicKey: vapidPublic, privateKey: vapidPrivate, subject: vapidSubject } = config.webPush;
const webPushEnabled = !!vapidPublic && !!vapidPrivate;
if (webPushEnabled) webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!);
export const vapidPublicKey = webPushEnabled ? vapidPublic! : null;

export const pushEnabled = !!signingKey || !!fcmAccount || webPushEnabled;
const platforms = [...(signingKey ? ['ios'] : []), ...(fcmAccount ? ['android'] : []), ...(webPushEnabled ? ['web'] : [])];

// O token da Apple vale 1 h e não pode ser trocado mais de uma vez a cada 20 min: renova a cada 50 min.
let jwt: { token: string; at: number } | null = null;
function providerToken() {
  if (jwt && Date.now() - jwt.at < 50 * 60_000) return jwt.token;
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat: Math.floor(Date.now() / 1000) })}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: signingKey!, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jwt = { token: `${unsigned}.${signature}`, at: Date.now() };
  return jwt.token;
}

// Uma conexão HTTP/2 reaproveitada; se cair, abre outra no próximo envio.
let session: ClientHttp2Session | null = null;
function apns() {
  if (session && !session.closed && !session.destroyed) return session;
  session = connect(host);
  session.on('error', () => (session = null));
  session.on('goaway', () => (session = null));
  session.unref();
  return session;
}

// badge: total de mensagens não lidas (número no ícone do app).
type Payload = { title: string; body: string; threadId?: string; data?: Record<string, string>; badge?: number;
  /** Só Android, sem aviso visível: o app nativo decide o que mostrar (tela de ligação). */
  androidData?: boolean };

function sendApnsRaw(token: string, p: Payload): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      aps: {
        alert: { title: p.title, body: p.body },
        sound: 'default',
        ...(p.threadId && { 'thread-id': p.threadId }),
        ...(p.badge !== undefined && { badge: p.badge }),
      },
      ...p.data,
    });
    let req;
    try {
      req = apns().request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${providerToken()}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 3600),
        'content-type': 'application/json',
      });
    } catch {
      session = null;
      return resolve({ status: 0, reason: 'connection' });
    }
    let status = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.setTimeout(10_000, () => req.close());
    req.on('response', (headers) => (status = Number(headers[':status'])));
    req.on('data', (chunk: string) => (raw += chunk));
    req.on('error', () => resolve({ status: 0, reason: 'connection' }));
    req.on('close', () => {
      let reason: string | undefined;
      try {
        reason = raw ? (JSON.parse(raw) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    req.end(body);
  });
}

// Token que a Apple não aceita mais (app removido, token de outro app...): apaga para não insistir.
const DEAD_TOKEN = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken']);

/** Resultado de um envio: dead = o aparelho não existe mais e o token deve ser apagado. */
type SendResult = { ok: boolean; dead?: boolean; error?: string };

async function sendApns(token: string, p: Payload): Promise<SendResult> {
  const res = await sendApnsRaw(token, p);
  if (res.status === 200) return { ok: true };
  const dead = res.status === 410 || (res.status === 400 && !!res.reason && DEAD_TOKEN.has(res.reason));
  return { ok: false, dead, error: `APNs ${res.status} ${res.reason ?? ''}` };
}

// Token de acesso do Google (OAuth, vale 1 h): JWT RS256 assinado com a chave da conta de serviço.
let fcmAccess: { token: string; until: number } | null = null;
async function fcmAccessToken() {
  if (fcmAccess && Date.now() < fcmAccess.until) return fcmAccess.token;
  const sa = fcmAccount!;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const assertion = `${unsigned}.${sign('sha256', Buffer.from(unsigned), sa.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status} ${await res.text().catch(() => '')}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  fcmAccess = { token: data.access_token, until: Date.now() + (data.expires_in - 300) * 1000 };
  return fcmAccess.token;
}

async function sendFcm(token: string, p: Payload): Promise<SendResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fcmAccount!.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await fcmAccessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        ...(!p.androidData && { notification: { title: p.title, body: p.body } }),
        data: p.data ?? {},
        android: p.androidData ? { priority: 'HIGH', ttl: '60s' } : {
          priority: 'HIGH',
          ttl: '86400s',
          // tag: avisos da mesma conversa se substituem em vez de empilhar.
          notification: {
            sound: 'default',
            ...(p.threadId && { tag: p.threadId }),
            ...(p.badge !== undefined && { notification_count: p.badge }),
          },
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => '');
  // App desinstalado ou token inválido: o Google responde 404 UNREGISTERED ou 400 "registration token".
  const dead = res.status === 404 || text.includes('UNREGISTERED') || (res.status === 400 && text.includes('registration token'));
  return { ok: false, dead, error: `FCM ${res.status} ${text.slice(0, 200)}` };
}

async function sendWeb(token: string, p: Payload): Promise<SendResult> {
  try {
    const subscription = JSON.parse(token) as webpush.PushSubscription;
    await webpush.sendNotification(subscription, JSON.stringify({ title: p.title, body: p.body, tag: p.threadId, badge: p.badge, data: p.data ?? {} }), {
      TTL: 86400,
      urgency: 'high',
      ...(p.threadId && { topic: p.threadId.slice(0, 32) }),
    });
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 0;
    // 404/410: a inscrição não existe mais (app removido, permissão retirada).
    return { ok: false, dead: status === 404 || status === 410, error: `WebPush ${status} ${(error as Error).message} ${String((error as { body?: unknown }).body ?? '').slice(0, 200)}` };
  }
}

async function sendToUsers(userIds: string[], build: (userId: string) => Payload | null) {
  if (!pushEnabled || userIds.length === 0) return;
  const devices = await prisma.pushDevice.findMany({
    where: { userId: { in: userIds }, platform: { in: platforms }, session: { revokedAt: null } },
    select: { id: true, userId: true, token: true, platform: true },
  });
  await Promise.all(
    devices.map(async (d) => {
      const payload = build(d.userId);
      if (!payload || (payload.androidData && d.platform !== 'android')) return;
      let res: SendResult;
      try {
        res =
          d.platform === 'android'
            ? await sendFcm(d.token, payload)
            : d.platform === 'web'
              ? await sendWeb(d.token, payload)
              : await sendApns(d.token, payload);
      } catch (error) {
        res = { ok: false, error: (error as Error).message };
      }
      if (res.dead) await prisma.pushDevice.deleteMany({ where: { id: d.id } });
      else if (!res.ok) console.error('Notificação recusada:', res.error);
    }),
  );
}

const PREVIEW: Record<string, string> = {
  IMAGE: '📷 Foto',
  VIDEO: '🎥 Vídeo',
  AUDIO: '🎤 Áudio',
  FILE: '📄 Documento',
  LOCATION: '📍 Localização',
  CONTACT: '👤 Contato',
  STICKER: '💟 Figurinha',
};

const clip = (text: string, max = 180) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Nome de quem enviou como cada destinatário salvou na agenda (ou o nome do perfil). */
async function namesFor(recipients: string[], senderId: string, fallback: string) {
  const [saved, sender] = await Promise.all([
    prisma.contact.findMany({
      where: { ownerId: { in: recipients }, contactId: senderId },
      select: { ownerId: true, firstName: true, lastName: true },
    }),
    prisma.user.findUnique({ where: { id: senderId }, select: { phone: true } }),
  ]);
  const byOwner = new Map(saved.map((c) => [c.ownerId, savedName(c) || fallback]));
  // Quem não salvou o remetente vê o número (como no WhatsApp).
  const unsaved = sender?.phone ? displayPhone(sender.phone) : fallback;
  return new Map(recipients.map((id) => [id, byOwner.get(id) ?? unsaved]));
}

/** Mensagem nova: avisa os outros participantes que não silenciaram a conversa. */
export async function pushNewMessage(messageId: string) {
  if (!pushEnabled) return;
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      senderId: true,
      body: true,
      attachmentType: true,
      sender: { select: { displayName: true } },
      conversation: { select: { type: true, title: true, participants: { select: { userId: true, mutedUntil: true } } } },
    },
  });
  if (!m) return;
  const now = Date.now();
  const recipients = m.conversation.participants
    .filter((p) => p.userId !== m.senderId && !(p.mutedUntil && p.mutedUntil.getTime() > now))
    .map((p) => p.userId);
  if (!recipients.length) return;

  const kind = m.attachmentType ? PREVIEW[m.attachmentType] : undefined;
  const text = clip(m.body ? (kind && kind !== PREVIEW.STICKER ? `${kind.split(' ')[0]} ${m.body}` : m.body) : (kind ?? 'Nova mensagem'));
  const names = await namesFor(recipients, m.senderId, m.sender.displayName);
  const group = m.conversation.type === 'GROUP';

  // Não lidas de cada destinatário (já contando esta), para o número no ícone do app.
  const unread = await prisma.messageReceipt.groupBy({
    by: ['userId'],
    where: { userId: { in: recipients }, readAt: null, message: { deletedAt: null } },
    _count: { _all: true },
  });
  const unreadBy = new Map(unread.map((u) => [u.userId, u._count._all]));

  await sendToUsers(recipients, (userId) => {
    const sender = names.get(userId)!;
    return {
      badge: unreadBy.get(userId) ?? 1,
      title: group ? (m.conversation.title ?? 'Grupo') : sender,
      body: group ? `${sender}: ${text}` : text,
      threadId: m.conversationId,
      data: { conversationId: m.conversationId },
    };
  });
}

/** Ligação chamando: avisa quem está sendo chamado (tocar no aviso abre o app ainda chamando). */
export async function pushIncomingCall(callId: string, callerId: string, callerName: string, userIds: string[], video: boolean) {
  if (!pushEnabled) return;
  const names = await namesFor(userIds, callerId, callerName);
  // Android: tela de ligação em tela cheia (também com o aparelho bloqueado).
  await sendToUsers(userIds, (userId) => ({
    title: '',
    body: '',
    androidData: true,
    data: { type: 'call', callId, callerName: names.get(userId)!, video: video ? '1' : '0' },
  }));
  await sendToUsers(userIds, (userId) => ({
    title: names.get(userId)!,
    body: video ? '📹 Chamada de vídeo' : '📞 Ligação de voz',
    data: { call: '1' },
  }));
}

/** Parou de tocar (atendeu, recusou, desistiu ou caiu): fecha a tela de ligação no Android. */
export async function pushCallEnded(callId: string, userIds: string[]) {
  await sendToUsers(userIds, () => ({ title: '', body: '', androidData: true, data: { type: 'call-end', callId } }));
}
