import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../errors.js';
import { blockUser, listBlockedUsers, unblockUser } from '../services/blocks.js';
import { HttpError } from '../errors.js';
import { prisma } from '../db.js';
import { addContact, importContacts, listContacts, listPhoneContacts, removeContact, removePhoneContact, savePhoneContact } from '../services/contacts.js';
import { INVALID_PHONE_MESSAGE, normalizePhone } from '../services/phone.js';

const searchSchema = z.object({ q: z.string().trim().max(50).default('') });
// "query" = número ou @usuário num campo só (aviso de número desconhecido). O formulário
// "Novo contato" manda phone/username separados, mais o nome salvo.
const addSchema = z.object({
  query: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(30).optional(),
  username: z.string().trim().max(40).optional(),
  firstName: z.string().trim().max(40).optional(),
  lastName: z.string().trim().max(40).optional(),
  // "Novo contato": se o número ainda não usa o Zynko, salva mesmo assim (fica em "Convidar para o Zynko").
  allowPending: z.boolean().optional(),
});
const removeParam = z.object({ userId: z.string().min(1) });
const importSchema = z.object({ phones: z.array(z.string().max(40)).min(1).max(1000) });

export async function contactRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Lista (com busca opcional) só os contatos que esta pessoa já adicionou.
  app.get('/contacts', auth, async (request) => {
    const { q } = validate(searchSchema, request.query);
    return { contacts: await listContacts(request.user.sub, q) };
  });

  // Adiciona pelo telefone ou pelo @usuário exato — não dá para "descobrir" gente por nome parecido.
  app.post('/contacts', auth, async (request, reply) => {
    const data = validate(addSchema, request.body);
    if (data.allowPending && data.phone) {
      const phone = normalizePhone(data.phone);
      if (!phone) throw new HttpError(400, INVALID_PHONE_MESSAGE);
      const exists = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (!exists) {
        reply.code(201);
        return { contact: null, pending: await savePhoneContact(request.user.sub, phone, data.firstName, data.lastName) };
      }
    }
    // Parece número (só dígitos/símbolos de telefone)? Trata como telefone, mesmo se estiver errado,
    // para o erro ser "número inválido" e não "nenhum usuário com esse nome".
    const looksLikePhone = (q: string) => !/[a-z@]/i.test(q) && q.replace(/\D/g, '').length >= 8;
    const fromQuery = data.query ? (looksLikePhone(data.query) ? { phone: data.query } : { username: data.query }) : {};
    const contact = await addContact(request.user.sub, { ...fromQuery, ...data });
    reply.code(201);
    return { contact };
  });

  // Números salvos que ainda não usam o Zynko (lista "Convidar para o Zynko").
  app.get('/contacts/pending', auth, async (request) => ({ pending: await listPhoneContacts(request.user.sub) }));

  app.delete('/contacts/pending/:id', auth, async (request) => {
    const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
    await removePhoneContact(request.user.sub, id);
    return { ok: true };
  });

  // Importar da agenda do celular: recebe só números e adiciona quem já usa o Zynko.
  // Números de quem não usa o Zynko não são guardados.
  app.post(
    '/contacts/import',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (request) => {
      const { phones } = validate(importSchema, request.body);
      return importContacts(request.user.sub, phones);
    },
  );

  app.delete('/contacts/:userId', auth, async (request) => {
    const { userId } = validate(removeParam, request.params);
    await removeContact(request.user.sub, userId);
    return { ok: true };
  });

  // Configurações > Privacidade > Contatos bloqueados.
  app.get('/contacts/blocked', auth, async (request) => {
    return { users: await listBlockedUsers(request.user.sub) };
  });

  app.post('/contacts/:userId/block', auth, async (request) => {
    const { userId } = validate(removeParam, request.params);
    await blockUser(request.user.sub, userId);
    return { ok: true };
  });

  app.delete('/contacts/:userId/block', auth, async (request) => {
    const { userId } = validate(removeParam, request.params);
    await unblockUser(request.user.sub, userId);
    return { ok: true };
  });
}
