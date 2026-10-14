import { sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, type ClientHttp2Session } from 'node:http2';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { savedName } from './contacts.js';

/**
 * Notificações do app de iPhone pelo APNs (serviço da Apple), sem bibliotecas: HTTP/2 + token JWT (ES256)
 * assinado com a chave .p8. Sem APNS_* no .env, tudo aqui vira "não faz nada".
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
export const pushEnabled = !!signingKey;

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

type Payload = { title: string; body: string; threadId?: string; data?: Record<string, string> };

function sendOne(token: string, p: Payload): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      aps: { alert: { title: p.title, body: p.body }, sound: 'default', ...(p.threadId && { 'thread-id': p.threadId }) },
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

async function sendToUsers(userIds: string[], build: (userId: string) => Payload | null) {
  if (!pushEnabled || userIds.length === 0) return;
  const devices = await prisma.pushDevice.findMany({
    where: { userId: { in: userIds }, platform: 'ios', session: { revokedAt: null } },
    select: { id: true, userId: true, token: true },
  });
  await Promise.all(
    devices.map(async (d) => {
      const payload = build(d.userId);
      if (!payload) return;
      const res = await sendOne(d.token, payload);
      if (res.status === 410 || (res.status === 400 && res.reason && DEAD_TOKEN.has(res.reason))) {
        await prisma.pushDevice.deleteMany({ where: { id: d.id } });
      } else if (res.status !== 200) {
        console.error('APNs recusou a notificação:', res.status, res.reason ?? '');
      }
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
  const saved = await prisma.contact.findMany({
    where: { ownerId: { in: recipients }, contactId: senderId },
    select: { ownerId: true, firstName: true, lastName: true },
  });
  const byOwner = new Map(saved.map((c) => [c.ownerId, savedName(c)]));
  return new Map(recipients.map((id) => [id, byOwner.get(id) || fallback]));
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

  await sendToUsers(recipients, (userId) => {
    const sender = names.get(userId)!;
    return {
      title: group ? (m.conversation.title ?? 'Grupo') : sender,
      body: group ? `${sender}: ${text}` : text,
      threadId: m.conversationId,
      data: { conversationId: m.conversationId },
    };
  });
}

/** Ligação chamando: avisa quem está sendo chamado (tocar no aviso abre o app ainda chamando). */
export async function pushIncomingCall(callerId: string, callerName: string, userIds: string[], video: boolean) {
  if (!pushEnabled) return;
  const names = await namesFor(userIds, callerId, callerName);
  await sendToUsers(userIds, (userId) => ({
    title: names.get(userId)!,
    body: video ? '📹 Chamada de vídeo' : '📞 Ligação de voz',
    data: { call: '1' },
  }));
}
