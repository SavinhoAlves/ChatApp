import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { disconnectSession, emitToUsers } from '../io.js';
import { notifyConversationChanged } from './chat.js';

/** Apaga do disco os arquivos enviados que ninguém mais usa (mensagem, figurinha favorita ou foto de perfil). */
async function removeOrphanUploads(urls: Iterable<string>) {
  for (const url of new Set(urls)) {
    if (!/^\/uploads\/[\w.-]+$/.test(url)) continue;
    const [inMessages, inStickers, inAvatars] = await Promise.all([
      prisma.message.count({ where: { attachmentUrl: url } }),
      prisma.userSticker.count({ where: { url } }),
      prisma.user.count({ where: { avatarUrl: url } }),
    ]);
    if (inMessages + inStickers + inAvatars === 0) await unlink(join(config.uploadDir, basename(url))).catch(() => {});
  }
}

/**
 * "Excluir minha conta" (exigência da App Store). Apaga de vez:
 * - grupos: sai de cada um (o mais antigo vira admin se precisar; grupo vazio some);
 * - conversas individuais: somem para os dois lados, com as mensagens;
 * - mensagens enviadas em grupos, contatos, bloqueios, figurinhas, sessões e aparelhos de notificação;
 * - arquivos enviados que ninguém mais usa.
 */
export async function deleteAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      sessions: { select: { id: true } },
      stickers: { select: { url: true } },
      messages: { where: { attachmentUrl: { startsWith: '/uploads/' } }, select: { attachmentUrl: true } },
      participations: {
        select: {
          conversationId: true,
          conversation: { select: { type: true, participants: { select: { id: true, userId: true, role: true, joinedAt: true } } } },
        },
      },
    },
  });
  if (!user) return;

  const files = [
    ...(user.avatarUrl ? [user.avatarUrl] : []),
    ...user.stickers.map((s) => s.url),
    ...user.messages.map((m) => m.attachmentUrl!),
  ];

  const groupChanges: { conversationId: string; memberIds: string[] }[] = [];
  const removedDirect: { conversationId: string; otherIds: string[] }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const p of user.participations) {
      const others = p.conversation.participants.filter((x) => x.userId !== userId);
      if (p.conversation.type === 'DIRECT' || others.length === 0) {
        await tx.conversation.delete({ where: { id: p.conversationId } });
        removedDirect.push({ conversationId: p.conversationId, otherIds: others.map((x) => x.userId) });
        continue;
      }
      // Grupo nunca fica sem administrador: o participante mais antigo assume.
      if (!others.some((x) => x.role === 'ADMIN')) {
        const oldest = [...others].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0]!;
        await tx.participant.update({ where: { id: oldest.id }, data: { role: 'ADMIN' } });
      }
      groupChanges.push({ conversationId: p.conversationId, memberIds: others.map((x) => x.userId) });
    }
    await tx.qrLogin.deleteMany({ where: { userId } });
    await tx.callLink.deleteMany({ where: { creatorId: userId } });
    // O resto (mensagens, participações, contatos, sessões, aparelhos…) vai junto pelo onDelete: Cascade.
    await tx.user.delete({ where: { id: userId } });
  });

  for (const s of user.sessions) disconnectSession(s.id);
  for (const d of removedDirect) emitToUsers(d.otherIds, 'conversation:removed', { conversationId: d.conversationId });
  for (const g of groupChanges) notifyConversationChanged(g.conversationId, g.memberIds);
  await removeOrphanUploads(files);
}
