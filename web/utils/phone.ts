/** Mostra um número E.164 do jeito que se lê no Brasil: "(11) 98888-0001", "0800 123 4567", "4004-1234". */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  if (!e164.startsWith('+55')) return e164.replace(/^\+(\d{1,3})(\d+)/, '+$1 $2');
  const n = e164.slice(3);
  let m: RegExpMatchArray | null;
  if ((m = n.match(/^(800|300|303|500)(\d{3})(\d{4})$/))) return `0${m[1]} ${m[2]} ${m[3]}`;
  if ((m = n.match(/^(40\d{2})(\d{4})$/))) return `${m[1]}-${m[2]}`;
  if ((m = n.match(/^(\d{2})(9\d{4})(\d{4})$/))) return `(${m[1]}) ${m[2]}-${m[3]}`;
  if ((m = n.match(/^(\d{2})(\d{4})(\d{4})$/))) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}
