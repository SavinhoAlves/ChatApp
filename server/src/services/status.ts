import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { emitToUsers } from '../io.js';
import { listBlockedIds } from './blocks.js';
import { contactNameMap } from './contacts.js';

/**
 * Status ("Atualizações"), como no WhatsApp: texto, foto ou vídeo que some em 24 h.
 * Quem vê: as pessoas que VOCÊ salvou nos contatos (e que não bloqueou). Cada um vê os status de quem o salvou.
 */
const TTL_MS = 24 * 60 * 60_000;
const authorSelect = { id: true, displayName: true, avatarUrl: true } as const;

/** Quem pode ver os status deste autor: os contatos que ele salvou, menos os bloqueados. */
async function audienceOf(authorId: string) {
  const [contacts, blocked] = await Promise.all([
    prisma.contact.findMany({ where: { ownerId: authorId }, select: { contactId: true } }),
    listBlockedIds(authorId),
  ]);
  const blockedSet = new Set(blocked);
  return contacts.map((c) => c.contactId).filter((id) => !blockedSet.has(id));
}

async function canSee(viewerId: string, authorId: string) {
  if (viewerId === authorId) return true;
  const saved = await prisma.contact.findUnique({ where: { ownerId_contactId: { ownerId: authorId, contactId: viewerId } }, select: { id: true } });
  if (!saved) return false;
  return !(await listBlockedIds(authorId)).includes(viewerId);
}

function serialize(s: { id: string; type: string; text: string | null; background: string | null; mediaUrl: string | null; createdAt: Date; expiresAt: Date }) {
  return {
    id: s.id,
    type: s.type,
    text: s.text,
    background: s.background,
    mediaUrl: s.mediaUrl,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  };
}

export async function listStatuses(viewerId: string) {
  const now = new Date();
  const mine = await prisma.status.findMany({
    where: { userId: viewerId, expiresAt: { gt: now } },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { views: true } } },
  });

  // Autores que salvaram você nos contatos dele (e não te bloquearam).
  const savedMe = await prisma.contact.findMany({ where: { contactId: viewerId }, select: { ownerId: true } });
  const blockedMe = new Set(
    (await prisma.block.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } })).map((b) => b.blockerId),
  );
  const authorIds = savedMe.map((c) => c.ownerId).filter((id) => !blockedMe.has(id));
  const rows = authorIds.length
    ? await prisma.status.findMany({
        where: { userId: { in: authorIds }, expiresAt: { gt: now } },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: authorSelect }, views: { where: { viewerId }, select: { viewerId: true } } },
      })
    : [];

  const names = await contactNameMap(viewerId);
  const byAuthor = new Map<string, { user: { id: string; displayName: string; avatarUrl: string | null }; statuses: ReturnType<typeof serialize>[]; viewed: boolean[] }>();
  for (const r of rows) {
    const group = byAuthor.get(r.userId) ?? {
      user: { ...r.user, displayName: names.get(r.userId) || r.user.displayName },
      statuses: [],
      viewed: [],
    };
    group.statuses.push(serialize(r));
    group.viewed.push(r.views.length > 0);
    byAuthor.set(r.userId, group);
  }
  const others = [...byAuthor.values()]
    .map((g) => ({
      user: g.user,
      statuses: g.statuses.map((s, i) => ({ ...s, viewed: g.viewed[i]! })),
      allViewed: g.viewed.every(Boolean),
      lastAt: g.statuses[g.statuses.length - 1]!.createdAt,
    }))
    .sort((a, b) => Number(a.allViewed) - Number(b.allViewed) || b.lastAt.localeCompare(a.lastAt));

  return { mine: mine.map((s) => ({ ...serialize(s), views: s._count.views })), others };
}

const isOwnUpload = (url: string) => /^\/uploads\/[\w.-]+$/.test(url);

export async function createStatus(
  userId: string,
  data: { type: 'TEXT'; text: string; background: string } | { type: 'IMAGE' | 'VIDEO'; mediaUrl: string; text?: string | null },
) {
  if (data.type !== 'TEXT' && !isOwnUpload(data.mediaUrl)) throw new HttpError(400, 'Arquivo inválido');
  const status = await prisma.status.create({
    data: {
      userId,
      type: data.type,
      text: data.text?.trim() || null,
      background: data.type === 'TEXT' ? data.background : null,
      mediaUrl: data.type === 'TEXT' ? null : data.mediaUrl,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  emitToUsers([userId, ...(await audienceOf(userId))], 'status:changed', { userId });
  return serialize(status);
}

export async function viewStatus(viewerId: string, statusId: string) {
  const s = await prisma.status.findUnique({ where: { id: statusId }, select: { userId: true, expiresAt: true } });
  if (!s || s.expiresAt < new Date() || !(await canSee(viewerId, s.userId))) throw new HttpError(404, 'Status não encontrado');
  if (s.userId === viewerId) return;
  const created = await prisma.statusView.upsert({
    where: { statusId_viewerId: { statusId, viewerId } },
    create: { statusId, viewerId },
    update: {},
  });
  // Avisa o autor (contador de visualizações) só na primeira vez.
  if (Date.now() - created.viewedAt.getTime() < 5000) emitToUsers([s.userId], 'status:changed', { userId: s.userId });
}

export async function statusViewers(userId: string, statusId: string) {
  const s = await prisma.status.findUnique({ where: { id: statusId }, select: { userId: true } });
  if (!s || s.userId !== userId) throw new HttpError(404, 'Status não encontrado');
  const [views, names] = await Promise.all([
    prisma.statusView.findMany({ where: { statusId }, orderBy: { viewedAt: 'desc' }, include: { viewer: { select: authorSelect } } }),
    contactNameMap(userId),
  ]);
  return views.map((v) => ({ ...v.viewer, displayName: names.get(v.viewerId) || v.viewer.displayName, viewedAt: v.viewedAt.toISOString() }));
}

async function removeFile(url: string | null) {
  if (!url || !isOwnUpload(url)) return;
  const [inMessages, inStatus] = await Promise.all([
    prisma.message.count({ where: { attachmentUrl: url } }),
    prisma.status.count({ where: { mediaUrl: url } }),
  ]);
  if (inMessages + inStatus === 0) await unlink(join(config.uploadDir, basename(url))).catch(() => {});
}

export async function deleteStatus(userId: string, statusId: string) {
  const s = await prisma.status.findUnique({ where: { id: statusId }, select: { userId: true, mediaUrl: true } });
  if (!s || s.userId !== userId) throw new HttpError(404, 'Status não encontrado');
  await prisma.status.delete({ where: { id: statusId } });
  await removeFile(s.mediaUrl);
  emitToUsers([userId, ...(await audienceOf(userId))], 'status:changed', { userId });
}

/** Apaga os status vencidos (24 h) e os arquivos deles. Roda junto da limpeza de mensagens temporárias. */
export async function sweepExpiredStatuses() {
  const expired = await prisma.status.findMany({ where: { expiresAt: { lt: new Date() } }, select: { id: true, mediaUrl: true }, take: 200 });
  if (!expired.length) return;
  await prisma.status.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });
  for (const s of expired) await removeFile(s.mediaUrl);
}
