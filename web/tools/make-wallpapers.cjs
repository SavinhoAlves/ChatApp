// Papéis de parede do Chat: padrões suaves que se repetem (tile), pensados para o tema escuro turquesa.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '../public/wallpapers');
fs.mkdirSync(OUT, { recursive: true });

const C = 'rgb(255 255 255)';
const C2 = 'rgb(255 255 255 / 0.55)';
const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke="${C}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;

// Ícones de linha (24x24), no espírito do app: balões, envio, mídia, localização, emoji…
const icons = {
  bubble: 'M4 5h16v10H9l-5 4z',
  bubbles: 'M3 4h12v8H7l-4 3zM9 15v1h8l4 3v-9h-3',
  plane: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3',
  pin: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  phone: 'M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
  image: 'M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M15 9h.01',
  clip: 'M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  ticks: 'M2 12l4 4 8-8M10 16l8-8',
  coffee: 'M4 8h13v5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6zM17 9h2a3 3 0 0 1 0 6h-2M8 2v3M12 2v3',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  cloud: 'M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z',
  gift: 'M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9S10 4 7.5 4a2 2 0 0 0 0 5M12 9s2-5 4.5-5a2 2 0 0 1 0 5',
  hash: 'M5 9h14M4 15h14M10 3 8 21M16 3l-2 18',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2',
};

function placeIcon(name, x, y, rot, scale = 1.15) {
  return `<path d="${icons[name]}" transform="translate(${x} ${y}) rotate(${rot} 12 12) scale(${scale})"/>`;
}

// 1) Rabiscos (doodle): ícones espalhados, como o fundo clássico de apps de mensagem.
const doodlePlan = [
  ['bubble', 10, 14, -12], ['plane', 78, 8, 8], ['heart', 150, 22, -6], ['camera', 222, 10, 10], ['mic', 290, 26, -14],
  ['smile', 30, 84, 6], ['pin', 104, 76, -8], ['music', 172, 92, 12], ['ticks', 244, 80, -4], ['star', 300, 104, 18],
  ['image', 6, 160, 4], ['phone', 82, 150, -10], ['bubbles', 148, 162, 6], ['clip', 220, 150, -20], ['coffee', 288, 172, 8],
  ['moon', 36, 232, -14], ['cloud', 108, 228, 4], ['gift', 182, 236, -8], ['hash', 252, 226, 12], ['sparkle', 314, 250, 0],
  ['heart', 14, 300, 12], ['bubble', 92, 302, 8], ['camera', 160, 296, -12], ['plane', 236, 300, -6], ['smile', 300, 318, 10],
];
const doodle = svg(352, doodlePlan.map(([n, x, y, r]) => placeIcon(n, x, y, r)).join(''));

// 2) Bolhas: círculos e balões soltos, bem leves.
const bubbleDots = [
  [30, 30, 14], [120, 60, 6], [200, 24, 9], [270, 80, 18], [60, 130, 8], [160, 140, 20], [250, 190, 7],
  [30, 220, 16], [110, 250, 6], [190, 260, 12], [280, 280, 9], [80, 310, 5],
];
const bolhas = svg(
  320,
  bubbleDots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('') +
    placeIcon('bubble', 214, 116, -8, 1.3) +
    placeIcon('bubble', 8, 168, 10, 1) +
    placeIcon('bubbles', 140, 200, 0, 1.1),
);

// 3) Ondas: linhas onduladas em diagonal suave.
let waves = '';
for (let i = 0; i < 8; i++) {
  const y = i * 40 + 10;
  waves += `<path d="M-10 ${y} q 20 -14 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke="${i % 2 ? C2 : C}"/>`;
}
const ondas = svg(320, waves);

// 4) Pontos: grade de pontinhos com cruzinhas de vez em quando.
let dots = '';
for (let x = 0; x < 8; x++) {
  for (let y = 0; y < 8; y++) {
    const cx = x * 32 + 16;
    const cy = y * 32 + 16;
    if ((x + y * 3) % 7 === 0) dots += `<path d="M${cx - 4} ${cy}h8M${cx} ${cy - 4}v8"/>`;
    else dots += `<circle cx="${cx}" cy="${cy}" r="1.3" fill="${C}" stroke="none"/>`;
  }
}
const pontos = svg(256, dots);

// 5) Constelação: estrelinhas ligadas por linhas finas.
const starsPts = [[24, 40], [90, 22], [150, 70], [220, 30], [290, 60], [60, 120], [130, 150], [200, 130], [270, 170], [30, 220], [110, 250], [180, 210], [250, 260], [300, 300], [70, 300]];
const links = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [12, 13], [14, 10], [2, 7], [5, 0]];
const constelacao = svg(
  320,
  links.map(([a, b]) => `<path d="M${starsPts[a][0]} ${starsPts[a][1]}L${starsPts[b][0]} ${starsPts[b][1]}" stroke="${C2}" stroke-width="1"/>`).join('') +
    starsPts.map(([x, y], i) => (i % 3 === 0 ? placeIcon('sparkle', x - 7, y - 7, 0, 0.6) : `<circle cx="${x}" cy="${y}" r="2" fill="${C}" stroke="none"/>`)).join(''),
);

const files = { doodle, bolhas, ondas, pontos, constelacao };
for (const [name, content] of Object.entries(files)) fs.writeFileSync(`${OUT}/${name}.svg`, content);
console.log('wallpapers:', Object.keys(files).join(', '));
