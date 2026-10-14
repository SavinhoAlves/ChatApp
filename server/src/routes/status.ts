import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../errors.js';
import { createStatus, deleteStatus, listStatuses, statusViewers, viewStatus } from '../services/status.js';

const idParam = z.object({ id: z.string().min(1) });
const createSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TEXT'),
    text: z.string().trim().min(1, 'Escreva algo').max(700),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  z.object({
    type: z.enum(['IMAGE', 'VIDEO']),
    mediaUrl: z.string().min(1),
    text: z.string().trim().max(700).nullish(),
  }),
]);

export async function statusRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get('/status', auth, async (request) => listStatuses(request.user.sub));

  app.post('/status', { ...auth, config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request) => ({
    status: await createStatus(request.user.sub, validate(createSchema, request.body)),
  }));

  app.post('/status/:id/view', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await viewStatus(request.user.sub, id);
    return { ok: true };
  });

  app.get('/status/:id/viewers', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    return { viewers: await statusViewers(request.user.sub, id) };
  });

  app.delete('/status/:id', auth, async (request) => {
    const { id } = validate(idParam, request.params);
    await deleteStatus(request.user.sub, id);
    return { ok: true };
  });
}
