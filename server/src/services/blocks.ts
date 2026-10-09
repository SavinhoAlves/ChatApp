import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { userSelect } from './chat.js';

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new HttpError(400, 'Ação inválida');
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
}

export async function isBlocked(blockerId: string, blockedId: string) {
  return !!(await prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } } }));
}

export async function listBlockedUsers(blockerId: string) {
  const rows = await prisma.block.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
    select: { blocked: { select: { ...userSelect, phone: true } } },
  });
  return rows.map((r) => r.blocked);
}

export async function listBlockedIds(blockerId: string) {
  const rows = await prisma.block.findMany({ where: { blockerId }, select: { blockedId: true } });
  return rows.map((r) => r.blockedId);
}
