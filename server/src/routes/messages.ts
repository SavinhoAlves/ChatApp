import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../errors.js';
import { deleteMessage, editMessage } from '../services/chat.js';

const idParam = z.object({ id: z.string().min(1) });
const editSchema = z.object({ body: z.string().trim().min(1, 'Mensagem vazia').max(4000) });

export async function messageRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.patch('/messages/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    const { body } = validate(editSchema, request.body);
    return { message: await editMessage(request.user.sub, id, body) };
  });

  // Apagar para todos.
  app.delete('/messages/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await deleteMessage(request.user.sub, id);
    return { ok: true };
  });
}
