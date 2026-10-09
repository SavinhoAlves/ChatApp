// Gera as figurinhas do app: o mascote (balão turquesa da logo) com expressões + faixa de texto.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '../public/stickers');
fs.mkdirSync(OUT, { recursive: true });

const INK = '#0b2b27';
const TEAL_A = '#7af0dc';
const TEAL_B = '#14b8a6';
const PINK = '#fb7185';
const GOLD = '#fbbf24';

// Corpo do mascote: balão arredondado com "rabinho" embaixo à esquerda.
const BODY = 'M100 30c41 0 72 25 72 60s-31 60-72 60c-9 0-17-1-25-3l-30 17 9-27c-16-11-26-28-26-47 0-35 31-60 72-60z';

const eyes = {
  dots: `<circle cx="78" cy="86" r="8" fill="${INK}"/><circle cx="122" cy="86" r="8" fill="${INK}"/><circle cx="81" cy="83" r="2.5" fill="#fff"/><circle cx="125" cy="83" r="2.5" fill="#fff"/>`,
  happy: `<path d="M68 90q10-12 20 0M112 90q10-12 20 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  hearts: `<path d="M78 98l-11-11a7 7 0 0 1 11-9 7 7 0 0 1 11 9z" fill="${PINK}"/><path d="M122 98l-11-11a7 7 0 0 1 11-9 7 7 0 0 1 11 9z" fill="${PINK}"/>`,
  sad: `<path d="M68 84q10 6 20 0M112 84q10 6 20 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M80 94q-4 9 0 12q4-3 0-12z" fill="#7dd3fc"/>`,
  wide: `<circle cx="78" cy="84" r="11" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="122" cy="84" r="11" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="78" cy="85" r="5" fill="${INK}"/><circle cx="122" cy="85" r="5" fill="${INK}"/>`,
  sleepy: `<path d="M68 88q10 7 20 0M112 88q10 7 20 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  look: `<circle cx="80" cy="84" r="8" fill="${INK}"/><circle cx="124" cy="80" r="8" fill="${INK}"/><path d="M112 66l22-6" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
};

const mouths = {
  smile: `<path d="M84 106q16 16 32 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  open: `<path d="M80 104q20 30 40 0z" fill="${INK}"/><path d="M90 116q10 8 20 0" fill="${PINK}"/>`,
  laugh: `<path d="M76 102q24 38 48 0z" fill="${INK}"/><path d="M88 118q12 9 24 0" fill="${PINK}"/>`,
  sad: `<path d="M86 116q14-12 28 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  o: `<ellipse cx="100" cy="114" rx="9" ry="11" fill="${INK}"/>`,
  flat: `<path d="M88 112h24" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
  sip: `<path d="M92 112q8 5 16 0" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
};

const cheeks = `<ellipse cx="64" cy="104" rx="8" ry="5" fill="${PINK}" opacity=".45"/><ellipse cx="136" cy="104" rx="8" ry="5" fill="${PINK}" opacity=".45"/>`;

// Detalhes extras (desenhados por cima, com borda branca de "adesivo").
const extras = {
  wave: `<g transform="rotate(-18 166 66)"><rect x="152" y="40" width="28" height="36" rx="13" fill="${GOLD}" stroke="#fff" stroke-width="5"/><path d="M158 48v-14M166 46v-17M174 48v-14" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/></g><path d="M186 30q8 8 4 18M192 22q12 12 6 28" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  heart: `<path d="M168 62l-18-18a11 11 0 0 1 18-14 11 11 0 0 1 18 14z" fill="${PINK}" stroke="#fff" stroke-width="5"/>`,
  thumb: `<g transform="translate(148 36)"><path d="M10 30h8v28h-8zM20 30l10-24c6 0 9 4 8 10l-2 10h14c5 0 8 4 7 9l-4 18c-1 4-4 6-8 6H20z" fill="${GOLD}" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></g>`,
  tears: `<path d="M64 98q-6 14 2 18q6-6-2-18z" fill="#7dd3fc" stroke="#fff" stroke-width="3"/>`,
  sparkle: `<path d="M170 30l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="${GOLD}" stroke="#fff" stroke-width="3"/><path d="M36 50l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${GOLD}" stroke="#fff" stroke-width="3"/>`,
  sun: `<g transform="translate(166 40)"><circle r="16" fill="${GOLD}" stroke="#fff" stroke-width="5"/><g stroke="${GOLD}" stroke-width="5" stroke-linecap="round"><path d="M0-28v-6M0 28v6M-28 0h-6M28 0h6M-20-20l-4-4M20 20l4 4M20-20l4-4M-20 20l-4 4"/></g></g>`,
  moon: `<path d="M178 26a22 22 0 1 0 14 34 18 18 0 0 1-14-34z" fill="${GOLD}" stroke="#fff" stroke-width="5"/><path d="M150 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M190 74l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff"/><text x="40" y="54" font-family="Segoe UI, Roboto, sans-serif" font-weight="800" font-size="22" fill="${INK}" stroke="#fff" stroke-width="5" paint-order="stroke">z<tspan font-size="16" dy="-10">z</tspan></text>`,
  confetti: `<g stroke="#fff" stroke-width="2"><rect x="30" y="34" width="10" height="16" rx="2" fill="${PINK}" transform="rotate(-25 35 42)"/><rect x="164" y="28" width="10" height="16" rx="2" fill="${GOLD}" transform="rotate(30 169 36)"/><circle cx="182" cy="70" r="6" fill="#a78bfa"/><circle cx="24" cy="78" r="5" fill="${GOLD}"/><rect x="146" y="12" width="8" height="12" rx="2" fill="#a78bfa" transform="rotate(-15 150 18)"/></g><path d="M44 8l4 8-6 4 8 4" stroke="${PINK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  coffee: `<g transform="translate(140 34)"><path d="M6 14h34v20a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M40 20h4a8 8 0 0 1 0 16h-4" stroke="${INK}" stroke-width="4" fill="none"/><path d="M16 8q-4-6 0-10M26 8q-4-6 0-10" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M10 20h26" stroke="#a16207" stroke-width="5"/></g>`,
  think: `<circle cx="160" cy="44" r="5" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="172" cy="30" r="8" fill="#fff" stroke="${INK}" stroke-width="3"/><text x="166" y="36" font-family="Segoe UI, Roboto, sans-serif" font-weight="900" font-size="14" fill="${INK}" text-anchor="middle">?</text><path d="M126 120q6 10 16 6" stroke="${GOLD}" stroke-width="10" stroke-linecap="round" fill="none"/>`,
  laughTears: `<path d="M62 94q-10 4-10 14 8 0 12-8z M138 94q10 4 10 14-8 0-12-8z" fill="#7dd3fc" stroke="#fff" stroke-width="3"/>`,
};

const stickers = [
  { id: 'ola', eyes: 'dots', mouth: 'open', extra: 'wave', label: 'Olá!' },
  { id: 'obrigado', eyes: 'happy', mouth: 'smile', extra: 'sparkle', label: 'Obrigado!' },
  { id: 'kkkk', eyes: 'happy', mouth: 'laugh', extra: 'laughTears', label: 'KKKKK', tilt: -6 },
  { id: 'amei', eyes: 'hearts', mouth: 'open', extra: 'heart', label: 'Amei!' },
  { id: 'joinha', eyes: 'dots', mouth: 'smile', extra: 'thumb', label: 'Beleza!' },
  { id: 'triste', eyes: 'sad', mouth: 'sad', extra: 'tears', label: 'Poxa…' },
  { id: 'uau', eyes: 'wide', mouth: 'o', extra: 'sparkle', label: 'Uau!' },
  { id: 'bom-dia', eyes: 'happy', mouth: 'open', extra: 'sun', label: 'Bom dia!' },
  { id: 'boa-noite', eyes: 'sleepy', mouth: 'flat', extra: 'moon', label: 'Boa noite' },
  { id: 'parabens', eyes: 'happy', mouth: 'laugh', extra: 'confetti', label: 'Parabéns!', tilt: 5 },
  { id: 'cafe', eyes: 'sleepy', mouth: 'sip', extra: 'coffee', label: 'Café?' },
  { id: 'pensando', eyes: 'look', mouth: 'flat', extra: 'think', label: 'Hmm…' },
];

function sticker(s) {
  const tilt = s.tilt ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TEAL_A}"/><stop offset="1" stop-color="${TEAL_B}"/></linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".28"/></filter>
  </defs>
  <g filter="url(#s)" transform="rotate(${tilt} 100 100)">
    <path d="${BODY}" fill="#fff" stroke="#fff" stroke-width="16" stroke-linejoin="round"/>
    <path d="${BODY}" fill="url(#g)"/>
    <ellipse cx="74" cy="54" rx="22" ry="10" fill="#fff" opacity=".35" transform="rotate(-18 74 54)"/>
    ${cheeks}
    ${eyes[s.eyes]}
    ${mouths[s.mouth]}
    ${extras[s.extra]}
    <g transform="rotate(-4 100 176)">
      <rect x="${100 - (s.label.length * 10.6 + 26) / 2}" y="158" width="${s.label.length * 10.6 + 26}" height="34" rx="17" fill="${INK}" stroke="#fff" stroke-width="5"/>
      <text x="100" y="181" text-anchor="middle" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="17" fill="#fff">${s.label}</text>
    </g>
  </g>
</svg>
`;
}

for (const s of stickers) fs.writeFileSync(path.join(OUT, `${s.id}.svg`), sticker(s));
console.log('stickers:', stickers.map((s) => s.id).join(', '));
