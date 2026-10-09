/**
 * Tipos de número:
 * - mobile:   celular do Brasil (DDD + 9 dígitos começando com 9) — recebe SMS
 * - landline: fixo do Brasil (DDD + 8 dígitos começando com 2–5) — código por ligação
 * - tollfree: 0800 / 0300 / 0303 / 0500 + 7 dígitos (empresas) — código por ligação
 * - shared:   número único 400x/402x/406x/409x + 4 dígitos, sem DDD (empresas) — código por ligação
 * - foreign:  fora do Brasil (não dá para saber se é celular) — SMS, com opção de ligação
 */
export type PhoneKind = 'mobile' | 'landline' | 'tollfree' | 'shared' | 'foreign';

/** Classifica a parte nacional de um número +55 (sem o 55). null = formato inválido. */
function brazilianKind(national: string): PhoneKind | null {
  if (/^(800|300|303|500)\d{7}$/.test(national)) return 'tollfree';
  if (/^40(0|2|6|9)\d{5}$/.test(national)) return 'shared';
  if (!/^[1-9][1-9]/.test(national)) return null;
  const local = national.slice(2);
  // Pega o erro comum de esquecer um dígito do celular (ex.: "22 9971-2714").
  if (local.length === 9) return local.startsWith('9') ? 'mobile' : null;
  if (local.length === 8) return /^[2-5]/.test(local) ? 'landline' : null;
  return null;
}

/** Aceita "(11) 99999-9999", "0800 123 4567", "4004-1234" ou "+5511999999999". Sem "+", assume Brasil (+55). */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (/[a-z@]/i.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  // O zero da frente (0800, 011…) é prefixo de discagem: no formato internacional ele sai.
  const e164 = trimmed.startsWith('+') ? `+${digits}` : `+55${digits.replace(/^0+/, '')}`;
  if (e164.startsWith('+55')) return brazilianKind(e164.slice(3)) ? e164 : null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Tipo de um número já normalizado (E.164). */
export function phoneKind(e164: string): PhoneKind {
  return e164.startsWith('+55') ? (brazilianKind(e164.slice(3)) ?? 'landline') : 'foreign';
}

/** Recebe SMS? Fixo e números de empresa (0800, 400x) só por ligação. */
export const canReceiveSms = (e164: string) => ['mobile', 'foreign'].includes(phoneKind(e164));

/** Mensagem de erro amigável para número que não passou na validação. */
export const INVALID_PHONE_MESSAGE = 'Número inválido. Confira o DDD e os 9 dígitos do celular (ou o 0800/4004 da empresa).';
