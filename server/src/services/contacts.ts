import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { userSelect } from './chat.js';
import { INVALID_PHONE_MESSAGE, normalizePhone } from './phone.js';

type ContactNames = { firstName: string | null; lastName: string | null };

/** Nome salvo na agenda ("Ana Souza"), ou null se a pessoa foi adicionada sem nome. */
/** Número para exibir: +55 11 99999-0000 (Brasil) ou o E.164 como veio. */
export function displayPhone(phone: string) {
  const br = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  return br ? `+55 ${br[1]} ${br[2]}-${br[3]}` : phone;
}

/**
 * Como o WhatsApp: quem não está nos meus contatos aparece pelo número (o nome do perfil fica só no
 * "~nome" dos dados do contato). Salvo sem nome: nome do perfil. Sem número (contas antigas): nome do perfil.
 */
export function nameFor(
  saved: Map<string, string | null>,
  viewerId: string,
  user: { id: string; displayName: string; phone?: string | null },
) {
  if (user.id === viewerId) return user.displayName;
  if (saved.has(user.id)) return saved.get(user.id) || user.displayName;
  return user.phone ? displayPhone(user.phone) : user.displayName;
}

export function savedName(c: ContactNames) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

/** Mostra o nome salvo no lugar do nome de perfil (como no WhatsApp); o do perfil fica em profileName. */
export function withSavedName<U extends { displayName: string }>(user: U, name: string | null) {
  return { ...user, displayName: name ?? user.displayName, profileName: user.displayName };
}

/** Contatos de quem está vendo: id → nome salvo (ou null). Serve também para saber "é contato?". */
export async function contactNameMap(ownerId: string) {
  const rows = await prisma.contact.findMany({
    where: { ownerId },
    select: { contactId: true, firstName: true, lastName: true },
  });
  return new Map(rows.map((r) => [r.contactId, savedName(r)]));
}

export async function listContacts(ownerId: string, q?: string) {
  const rows = await prisma.contact.findMany({
    where: {
      ownerId,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { contact: { username: { contains: q, mode: 'insensitive' } } },
              { contact: { displayName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: { contact: { select: userSelect } },
  });
  return rows
    .map((r) => withSavedName(r.contact, savedName(r)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
}

async function findByUsername(raw: string) {
  return prisma.user.findFirst({
    where: { username: { equals: raw.trim().replace(/^@/, ''), mode: 'insensitive' } },
    select: userSelect,
  });
}

export type NewContactInput = {
  /** Número (qualquer formato) e/ou @usuário. Com os dois, precisam ser da mesma pessoa. */
  phone?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export async function addContact(ownerId: string, input: NewContactInput) {
  const rawPhone = input.phone?.trim();
  const rawUsername = input.username?.trim();
  let target: Awaited<ReturnType<typeof findByUsername>> = null;

  if (rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new HttpError(400, INVALID_PHONE_MESSAGE);
    target = await prisma.user.findUnique({ where: { phone }, select: userSelect });
    if (!target) throw new HttpError(404, 'Esse número ainda não usa o Zynko');
    if (rawUsername && target.username.toLowerCase() !== rawUsername.replace(/^@/, '').toLowerCase()) {
      throw new HttpError(400, 'Esse nome de usuário não é do dono desse número');
    }
  } else if (rawUsername) {
    target = await findByUsername(rawUsername);
    if (!target) throw new HttpError(404, 'Nenhum usuário com esse nome de usuário');
  } else {
    throw new HttpError(400, 'Informe o número ou o nome de usuário');
  }
  if (target.id === ownerId) throw new HttpError(400, 'Você não pode se adicionar como contato');

  const names = {
    firstName: input.firstName?.trim() || null,
    lastName: input.lastName?.trim() || null,
  };
  const hasNames = !!(names.firstName || names.lastName);
  const row = await prisma.contact.upsert({
    where: { ownerId_contactId: { ownerId, contactId: target.id } },
    create: { ownerId, contactId: target.id, ...names },
    // Adicionar de novo sem nome (ex.: botão "Adicionar" do aviso) não apaga o nome já salvo.
    update: hasNames ? names : {},
  });
  return withSavedName(target, savedName(row));
}

export async function removeContact(ownerId: string, contactId: string) {
  await prisma.contact.deleteMany({ where: { ownerId, contactId } });
}

/** Garante que todos os ids informados já estão nos contatos de `ownerId`. */
export async function assertContacts(ownerId: string, userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const rows = await prisma.contact.findMany({
    where: { ownerId, contactId: { in: unique } },
    select: { contactId: true },
  });
  const have = new Set(rows.map((r) => r.contactId));
  if (unique.some((id) => !have.has(id))) {
    throw new HttpError(403, 'Adicione essa pessoa aos contatos antes de iniciar uma conversa');
  }
}

/** Adiciona de uma vez quem, entre os números da agenda, já tem conta. Devolve só os encontrados. */
export async function importContacts(ownerId: string, rawPhones: string[]) {
  const phones = [...new Set(rawPhones.map(normalizePhone).filter((p): p is string => !!p))];
  const found = phones.length
    ? await prisma.user.findMany({ where: { phone: { in: phones }, id: { not: ownerId } }, select: userSelect })
    : [];
  const existing = new Set(await listContactIds(ownerId));
  const fresh = found.filter((u) => !existing.has(u.id));
  if (fresh.length) {
    await prisma.contact.createMany({
      data: fresh.map((u) => ({ ownerId, contactId: u.id })),
      skipDuplicates: true,
    });
  }
  return {
    added: fresh.map((u) => withSavedName(u, null)),
    alreadyContacts: found.length - fresh.length,
    checked: phones.length,
  };
}

/** Ids de quem esta pessoa salvou nos contatos. */
export async function listContactIds(ownerId: string) {
  const rows = await prisma.contact.findMany({ where: { ownerId }, select: { contactId: true } });
  return rows.map((r) => r.contactId);
}

export async function isContact(ownerId: string, contactId: string) {
  const row = await prisma.contact.findUnique({ where: { ownerId_contactId: { ownerId, contactId } } });
  return !!row;
}

// ---------------------------------------------------------------------------
// Contatos com número que ainda não usa o Zynko ("Convidar para o Zynko")
// ---------------------------------------------------------------------------

const pendingSelect = { id: true, phone: true, firstName: true, lastName: true, createdAt: true } as const;
const serializePending = (p: { id: string; phone: string; firstName: string | null; lastName: string | null; createdAt: Date }) => ({
  id: p.id,
  phone: p.phone,
  displayName: savedName(p) ?? p.phone,
  createdAt: p.createdAt.toISOString(),
});

/** Salva (ou atualiza o nome de) um número que ainda não tem conta. */
export async function savePhoneContact(ownerId: string, phone: string, firstName?: string, lastName?: string) {
  const names = { firstName: firstName?.trim() || null, lastName: lastName?.trim() || null };
  const row = await prisma.phoneContact.upsert({
    where: { ownerId_phone: { ownerId, phone } },
    create: { ownerId, phone, ...names },
    update: names.firstName || names.lastName ? names : {},
    select: pendingSelect,
  });
  return serializePending(row);
}

export async function listPhoneContacts(ownerId: string) {
  const rows = await prisma.phoneContact.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' }, select: pendingSelect });
  return rows.map(serializePending).sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
}

export async function removePhoneContact(ownerId: string, id: string) {
  await prisma.phoneContact.deleteMany({ where: { id, ownerId } });
}

/**
 * Alguém se cadastrou com este número: quem tinha salvo o número ganha o contato de verdade,
 * com o nome que deu. Devolve quem deve ser avisado.
 */
export async function linkPhoneContacts(userId: string, phone: string) {
  const rows = await prisma.phoneContact.findMany({ where: { phone }, select: { id: true, ownerId: true, firstName: true, lastName: true } });
  if (!rows.length) return [];
  await prisma.contact.createMany({
    data: rows.filter((r) => r.ownerId !== userId).map((r) => ({ ownerId: r.ownerId, contactId: userId, firstName: r.firstName, lastName: r.lastName })),
    skipDuplicates: true,
  });
  await prisma.phoneContact.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return rows.map((r) => ({ ownerId: r.ownerId, name: savedName(r) }));
}
