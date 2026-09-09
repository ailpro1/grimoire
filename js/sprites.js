/* ============================================================
   GRIMOIRE - sprites.js
   Hand-drawn pixel art stored as ASCII maps and rendered to
   inline SVG at runtime. No image files, infinitely scalable,
   and it stays crisp because every pixel is a real rectangle.
   ============================================================ */

export const PAL = {
  K: '#17121f', // outline / ink
  W: '#f4f0e4', // bone white
  G: '#f0b429', // gold
  Y: '#ffe98a', // gold highlight
  R: '#c1362f', // red
  D: '#7a1f1c', // dark red
  B: '#3b5dc9', // blue
  L: '#7fd6f7', // light blue
  S: '#e0a878', // skin
  H: '#7a4a24', // wood / brown
  E: '#3f8f4a', // green
  N: '#245c2c', // dark green
  P: '#7b46b8', // purple
  M: '#b84a9c', // magenta
  T: '#43c9b0', // teal
  A: '#a8b4c0', // steel
  Z: '#4a5260', // dark steel
  O: '#e8792a', // orange
  C: '#efe2c0', // parchment
  c: '#d8c49a', // parchment shade
};

/* ---------- 12x12 item icons ---------- */

export const ICONS = {
  scroll: [
    '............',
    '.KKKKKKKKKK.',
    '.KccccccccK.',
    '.KCCCCCCCCK.',
    '.KCKKKKKKCK.',
    '.KCCCCCCCCK.',
    '.KCKKKKKKCK.',
    '.KCCCCCCCCK.',
    '.KCKKKKCCCK.',
    '.KccccccccK.',
    '.KKKKKKKKKK.',
    '............',
  ],
  chest: [
    '............',
    '..KKKKKKKK..',
    '.KHHHHHHHHK.',
    '.KHGGGGGGHK.',
    '.KHHHHHHHHK.',
    '.KKKKKKKKKK.',
    '.KHHHGGHHHK.',
    '.KHHHGGHHHK.',
    '.KHHHHHHHHK.',
    '.KHHHHHHHHK.',
    '.KKKKKKKKKK.',
    '............',
  ],
  tower: [
    '............',
    '.A.A.A.A.A..',
    '.AAAAAAAAA..',
    '.KAAAAAAAK..',
    '.KAALLLAAK..',
    '.KAALLLAAK..',
    '.KAAAAAAAK..',
    '.KAKAKAKAK..',
    '.KAAAAAAAK..',
    '.KAAKKKAAK..',
    '.KAAKKKAAK..',
    '.KKKKKKKKK..',
  ],
  sword: [
    '.....KK.....',
    '....KAAK....',
    '....KAAK....',
    '....KAAK....',
    '....KAAK....',
    '....KAAK....',
    '..GGGGGGGG..',
    '..GGGGGGGG..',
    '.....HH.....',
    '.....HH.....',
    '....GGGG....',
    '............',
  ],
  shield: [
    '............',
    '.KKKKKKKKKK.',
    '.KBBBBBBBBK.',
    '.KBGGBBGGBK.',
    '.KBBGBBGBBK.',
    '.KBBBGGBBBK.',
    '.KBBBGGBBBK.',
    '..KBBBBBBK..',
    '..KKBBBBKK..',
    '...KKBBKK...',
    '.....KK.....',
    '............',
  ],
  potion: [
    '....KKK.....',
    '....KWK.....',
    '....KWK.....',
    '...KKWKK....',
    '..KKMMMKK...',
    '..KMMMMMK...',
    '..KMMMMMK...',
    '..KMWMMMK...',
    '..KMMMMMK...',
    '..KKMMMKK...',
    '....KKK.....',
    '............',
  ],
  crown: [
    '............',
    '............',
    '..K...K...K.',
    '.KGK.KGK.KGK',
    '.KGGGGGGGGGK',
    '.KGGGGGGGGGK',
    '.KGRGGYGGRGK',
    '.KGGGGGGGGGK',
    '.KKKKKKKKKKK',
    '............',
    '............',
    '............',
  ],
  map: [
    '............',
    '.KKKKKKKKKK.',
    '.KCCCCCCCCK.',
    '.KCKCCCCCCK.',
    '.KCCKCCCCCK.',
    '.KCCCKKCCCK.',
    '.KCCCCCKCCK.',
    '.KCCCCCCKCK.',
    '.KCCCCCRRCK.',
    '.KCCCCCRRCK.',
    '.KKKKKKKKKK.',
    '............',
  ],
  key: [
    '............',
    '...KKKK.....',
    '..KGGGGK....',
    '..KGKKGK....',
    '..KGGGGK....',
    '...KGGK.....',
    '....KGK.....',
    '....KGKK....',
    '....KGK.....',
    '....KGKK....',
    '....KKK.....',
    '............',
  ],
  skull: [
    '............',
    '..KKKKKKKK..',
    '.KWWWWWWWWK.',
    '.KWWWWWWWWK.',
    '.KWKKWWKKWK.',
    '.KWKKWWKKWK.',
    '.KWWWWWWWWK.',
    '.KWWWKKWWWK.',
    '..KWWWWWWK..',
    '..KWKWKWKK..',
    '...KKKKKK...',
    '............',
  ],
  star: [
    '.....KK.....',
    '....KGGK....',
    '....KGGK....',
    '.KKKKGGKKKK.',
    '.KGGGGGGGGK.',
    '..KGGGGGGK..',
    '...KGGGGK...',
    '...KGGGGK...',
    '..KGGKKGGK..',
    '..KGK..KGK..',
    '...K....K...',
    '............',
  ],
  coin: [
    '............',
    '...KKKKK....',
    '..KYYYYYK...',
    '.KYGGGGGYK..',
    '.KYGGKGGYK..',
    '.KYGKKKGYK..',
    '.KYGGKGGYK..',
    '.KYGGGGGYK..',
    '..KGGGGGK...',
    '...KKKKK....',
    '............',
    '............',
  ],
  flame: [
    '.....K......',
    '....KOK.....',
    '....KOK.....',
    '...KOYOK....',
    '..KOYYYOK...',
    '..KOYYYOK...',
    '.KOYYWYYOK..',
    '.KOYWWWYOK..',
    '.KOYYWYYOK..',
    '..KOYYYOK...',
    '...KOOOK....',
    '....KKK.....',
  ],
  quill: [
    '........KKK.',
    '.......KWWWK',
    '......KWWWWK',
    '......KWWWK.',
    '.....KWWWK..',
    '....KWWWK...',
    '....KWWK....',
    '...KWWK.....',
    '..KWWK......',
    '..KGK.......',
    '.KGK........',
    '.K..........',
  ],
  book: [
    '............',
    '.KKKKKKKKKK.',
    '.KDGKRRRRRK.',
    '.KDDKRRRRRK.',
    '.KDGKRRGGRK.',
    '.KDDKRGTTGK.',
    '.KDGKRGTTGK.',
    '.KDDKRRGGRK.',
    '.KDGKRRRRRK.',
    '.KDDKRRRRRK.',
    '.KKKKWWWWWK.',
    '.KKKKKKKKKK.',
  ],
  glass: [
    '............',
    '...KKKK.....',
    '..KLLLLK....',
    '.KLWWLLLK...',
    '.KLWLLLLK...',
    '.KLLLLLLK...',
    '..KLLLLK....',
    '...KKKKAK...',
    '.......AAK..',
    '........AAK.',
    '.........AK.',
    '............',
  ],
  clock: [
    '............',
    '...KKKKKK...',
    '..KCCCCCCK..',
    '.KCCCKCCCCK.',
    '.KCCCKCCCCK.',
    '.KCCCKKKCCK.',
    '.KCCCCCCCCK.',
    '.KCCCCCCCCK.',
    '..KCCCCCCK..',
    '...KKKKKK...',
    '............',
    '............',
  ],
  heart: [
    '............',
    '..KK...KK...',
    '.KRRK.KRRK..',
    'KRRRRKRRRRK.',
    'KRWRRRRRRRK.',
    'KRRRRRRRRRK.',
    '.KRRRRRRRK..',
    '..KRRRRRK...',
    '...KRRRK....',
    '....KRK.....',
    '.....K......',
    '............',
  ],
};

/* ---------- 16x16 hero portraits ---------- */

export const AVATARS = {
  knight: [
    '................',
    '.......RR.......',
    '......RRRR......',
    '......RRRR......',
    '....ZAAAAAAZ....',
    '...ZAAAAAAAAZ...',
    '...ZAAAAAAAAZ...',
    '...ZKKKKKKKKZ...',
    '...ZAAAAAAAAZ...',
    '...ZAAKKKKAAZ...',
    '...ZAAAAAAAAZ...',
    '....ZAAAAAAZ....',
    '.....GGGGGG.....',
    '...ZAAAAAAAAZ...',
    '..ZAAAAAAAAAAZ..',
    '..ZA........AZ..',
  ],
  mage: [
    '.......K........',
    '......KPK.......',
    '.....KPPPK......',
    '....KPPPPPK.....',
    '...KPPPPPPPK....',
    '..KPPPPPPPPPK...',
    '.KKKKKKKKKKKKK..',
    '....KSSSSSK.....',
    '....KSKSKSK.....',
    '....KSSSSSK.....',
    '....KWWWWWK.....',
    '...KWWWWWWWK....',
    '...KWWWWWWWK....',
    '..KBBWWWWWBBK...',
    '..KBBBWWWBBBK...',
    '..KBB.....BBK...',
  ],
  ranger: [
    '................',
    '....KKKKKKKK....',
    '...KEEEEEEEEK...',
    '..KEEEEEEEEEEK..',
    '..KEENNNNNNEEK..',
    '..KEESSSSSSEEK..',
    '..KEESKSSKSEEK..',
    '..KEESSSSSSEEK..',
    '..KEESSKKSSEEK..',
    '...KEESSSSEEK...',
    '...KEEEEEEEEK...',
    '....KEEEEEEK....',
    '..KEEEEEEEEEEK..',
    '.KEEEEEHEEEEEEK.',
    '.KEEEEEHEEEEEEK.',
    '.KEE...H....EEK.',
  ],
  bard: [
    '................',
    '..........TT....',
    '.....KKKKKTT....',
    '....KMMMMMMTK...',
    '....KMMMMMMMK...',
    '....KKKKKKKKK...',
    '.....KSSSSSK....',
    '.....KSKSKSK....',
    '.....KSSSSSK....',
    '.....KSSSSSK....',
    '......KSSSK.....',
    '....KGGGGGGGK...',
    '...KOOOOOOOOOK..',
    '...KOOOGGGOOOK..',
    '...KOOOOOOOOOK..',
    '...KOO.....OOK..',
  ],
  monk: [
    '................',
    '....KKKKKKKK....',
    '...KHHHHHHHHK...',
    '..KHHHHHHHHHHK..',
    '..KHHKKKKKKHHK..',
    '..KHHKZZZZKHHK..',
    '..KHHKZYZYKHHK..',
    '..KHHKZZZZKHHK..',
    '..KHHKKZZKKHHK..',
    '..KHHHKKKKHHHK..',
    '...KHHHHHHHHK...',
    '...KHHHHHHHHK...',
    '..KHHHHHHHHHHK..',
    '.KHHHHHGHHHHHK..',
    '.KHHHHHHHHHHHK..',
    '.KHH.......HHK..',
  ],
  rogue: [
    '................',
    '....KKKKKKKK....',
    '...KZZZZZZZZK...',
    '..KZZZZZZZZZZK..',
    '..KZZZZZZZZZZK..',
    '..KZZSSSSSSZZK..',
    '..KZZSGSSGSZZK..',
    '..KZZSSSSSSZZK..',
    '..KZZKKKKKKZZK..',
    '...KZZKKKKZZK...',
    '...KZZZZZZZZK...',
    '....KZZZZZZK....',
    '..KZZZZZZZZZZK..',
    '.KZZZZRRRRZZZZK.',
    '.KZZZZZZZZZZZZK.',
    '.KZZ........ZZK.',
  ],
};

export const AVATAR_NAMES = {
  knight: 'Knight', mage: 'Mage', ranger: 'Ranger',
  bard: 'Bard', monk: 'Monk', rogue: 'Rogue',
};

/* ---------- the tome, used as the app mark ---------- */

export const TOME = [
  '................',
  '..KKKKKKKKKKKK..',
  '.KDGDKRRRRRRRRK.',
  '.KDDDKRRRRRRRRK.',
  '.KDGDKRRRRRRRGK.',
  '.KDDDKRRGGGGRRK.',
  '.KDGDKRRGTTGRRK.',
  '.KDDDKRRGTTGRRK.',
  '.KDGDKRRGGGGRRK.',
  '.KDDDKRRRRRRRGK.',
  '.KDGDKRRRRRRRRK.',
  '.KDDDKRRRRRRRRK.',
  '.KDGDKRRRRRRRRK.',
  '.KKKKKWWWWWWWWK.',
  '..KKKKKKKKKKKK..',
  '................',
];

/* ---------- renderer ---------- */

/**
 * ASCII map -> inline SVG string. Horizontal runs of the same
 * colour are merged into one <rect> to keep the DOM light.
 */
export function toSVG(map, { pixel = 2, palette = PAL, cls = '', title = '' } = {}) {
  const h = map.length;
  const w = map[0].length;
  let rects = '';
  for (let y = 0; y < h; y++) {
    const row = map[y];
    let x = 0;
    while (x < w) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') { x++; continue; }
      let len = 1;
      while (x + len < w && row[x + len] === ch) len++;
      const fill = palette[ch] || '#ff00ff';
      rects += `<rect x="${x}" y="${y}" width="${len}" height="1" fill="${fill}"/>`;
      x += len;
    }
  }
  const a11y = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg class="spr ${cls}" viewBox="0 0 ${w} ${h}" width="${w * pixel}" ` +
    `height="${h * pixel}" xmlns="http://www.w3.org/2000/svg" ` +
    `shape-rendering="crispEdges" ${a11y}>${rects}</svg>`;
}

export function icon(name, pixel = 2) {
  const map = ICONS[name] || ICONS.scroll;
  return toSVG(map, { pixel });
}

export function avatar(name, pixel = 4) {
  const map = AVATARS[name] || AVATARS.knight;
  return toSVG(map, { pixel, cls: 'spr-avatar' });
}

export function tome(pixel = 6) {
  return toSVG(TOME, { pixel, cls: 'spr-tome' });
}

/** For CSS background-image use. */
export function dataURI(map, palette = PAL) {
  const svg = toSVG(map, { pixel: 1, palette });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
