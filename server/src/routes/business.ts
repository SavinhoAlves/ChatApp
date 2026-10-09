import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validate } from '../errors.js';
import { userSelect } from '../services/chat.js';

/** Categorias de empresa (as mesmas do app, como no WhatsApp Business). */
export const BUSINESS_CATEGORIES = [
  'Alimentação e bebidas',
  'Automotivo',
  'Beleza, estética e cuidados pessoais',
  'Compras e varejo',
  'Educação',
  'Entretenimento',
  'Eventos',
  'Finanças e bancos',
  'Governo',
  'Hotelaria e hospedagem',
  'Imóveis',
  'Medicina e saúde',
  'ONG e organizações sem fins lucrativos',
  'Restaurante',
  'Serviços profissionais',
  'Tecnologia',
  'Vestuário',
  'Viagens e transporte',
  'Outros',
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const businessSchema = z.object({
  category: z.enum(BUSINESS_CATEGORIES, { message: 'Escolha a categoria da empresa' }),
  description: optionalText(256),
  hours: optionalText(120),
  address: optionalText(160),
  website: optionalText(120).refine((v) => !v || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v), {
    message: 'Site inválido',
  }),
  email: optionalText(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'E-mail inválido' }),
});

const profileSelect = { category: true, description: true, hours: true, address: true, website: true, email: true } as const;

export async function businessRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get('/business/categories', auth, async () => ({ categories: BUSINESS_CATEGORIES }));

  // Perfil comercial de alguém (aparece em "Dados do contato").
  app.get('/users/:id/business', auth, async (request) => {
    const { id } = validate(z.object({ id: z.string().min(1) }), request.params);
    const user = await prisma.user.findUnique({ where: { id }, select: { isBusiness: true, business: { select: profileSelect } } });
    if (!user?.isBusiness || !user.business) throw new HttpError(404, 'Esta conta não é comercial');
    return { business: user.business };
  });

  // Ativar ou editar a própria conta comercial.
  app.put('/me/business', auth, async (request) => {
    const me = request.user.sub;
    const data = validate(businessSchema, request.body);
    await prisma.$transaction([
      prisma.businessProfile.upsert({ where: { userId: me }, create: { userId: me, ...data }, update: data }),
      prisma.user.update({ where: { id: me }, data: { isBusiness: true } }),
    ]);
    const user = await prisma.user.findUnique({ where: { id: me }, select: { ...userSelect, phone: true, business: { select: profileSelect } } });
    return { user };
  });

  app.get('/me/business', auth, async (request) => {
    const profile = await prisma.businessProfile.findUnique({ where: { userId: request.user.sub }, select: profileSelect });
    return { business: profile };
  });

  // Voltar a ser conta pessoal (os dados da empresa são apagados).
  app.delete('/me/business', auth, async (request) => {
    const me = request.user.sub;
    await prisma.$transaction([
      prisma.businessProfile.deleteMany({ where: { userId: me } }),
      prisma.user.update({ where: { id: me }, data: { isBusiness: false } }),
    ]);
    const user = await prisma.user.findUnique({ where: { id: me }, select: { ...userSelect, phone: true } });
    return { user };
  });
}
