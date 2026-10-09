const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const longDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 24 * 60 * 60 * 1000;

/** Quantos dias de calendário separam a data de hoje (0 = hoje, 1 = ontem...). */
function daysAgo(date: Date) {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
}

export const formatTime = (iso: string) => time.format(new Date(iso));

export function isSameDay(a: string, b: string) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Separador de dia dentro da conversa. */
export function formatDayLabel(iso: string) {
  const date = new Date(iso);
  const diff = daysAgo(date);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff > 1 && diff < 7) return weekday.format(date).replace(/^./, (c) => c.toUpperCase());
  return longDate.format(date);
}

/** Horário na lista de conversas: hora se for hoje, "Ontem" ou a data. */
export function formatListTime(iso: string) {
  const date = new Date(iso);
  const diff = daysAgo(date);
  if (diff === 0) return time.format(date);
  if (diff === 1) return 'Ontem';
  return shortDate.format(date);
}

export function formatLastSeen(iso: string) {
  const date = new Date(iso);
  const diff = daysAgo(date);
  if (diff === 0) return `visto por último hoje às ${time.format(date)}`;
  if (diff === 1) return `visto por último ontem às ${time.format(date)}`;
  return `visto por último em ${shortDate.format(date)}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
