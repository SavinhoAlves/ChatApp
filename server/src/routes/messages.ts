import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../errors.js';
import { deleteMessage, editMessage, hideMessage, messageInfo, openViewOnce, setStar } from '../services/chat.js';

const idParam = z.object({ id: z.string().min(1) });
const editSchema = z.object({ body: z.string().trim().min(1, 'Mensagem vazia').max(4000) });
const scopeSchema = z.object({ scope: z.enum(['me', 'all']).default('all') });

export async function messageRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.patch('/messages/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { body } = validate(editSchema, request.body);
    return { message: await editMessage(request.user.sub, id, body) };
  });

  // Apagar: ?scope=all (para todos, com prazo; o master sem prazo) ou ?scope=me (só para mim).
  app.delete('/messages/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { scope } = validate(scopeSchema, request.query ?? {});
    if (scope === 'me') await hideMessage(request.user.sub, id);
    else await deleteMessage(request.user.sub, id);
    return { ok: true };
  });

  // Favoritar (estrela).
  app.put('/messages/:id/star', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await setStar(request.user.sub, id, true);
    return { ok: true };
  });
  app.delete('/messages/:id/star', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await setStar(request.user.sub, id, false);
    return { ok: true };
  });

  // Visualização única: entrega a mídia uma vez (a segunda tentativa recebe 410).
  app.post('/messages/:id/open', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    return openViewOnce(request.user.sub, id);
  });

  // "Dados": entregue e lida, com data e hora, por destinatário.
  app.get('/messages/:id/info', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    return messageInfo(request.user.sub, id);
  });
}
