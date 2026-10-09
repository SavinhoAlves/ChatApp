/** Mesmas categorias do servidor (server/src/routes/business.ts). */
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

export interface BusinessProfile {
  category: string;
  description: string | null;
  hours: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
}

/** Link clicável para o site (aceita "minhaempresa.com.br" sem https). */
export const websiteHref = (site: string) => (/^https?:\/\//i.test(site) ? site : `https://${site}`);
