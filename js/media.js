/* ============================================================
   GRIMOIRE - media.js
   Photo attachments. Pictures never touch localStorage (5 MB
   would fill in three snaps) - they live in IndexedDB, on this
   device only, and are processed down to something the 8-bit
   theme can wear: small, sharp-edged, optionally palette-mapped.
   ============================================================ */

import { PAL } from './sprites.js';

const DB_NAME = 'grimoire.media';
const STORE = 'photos';
let dbp = null;

/* ---------- IndexedDB plumbing ---------- */

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const available = () => 'indexedDB' in window;

/** record: {id, dataURL, w, h, bytes, name, style, addedAt} */
export function put(record) { return tx('readwrite', (s) => s.put(record)); }
export function get(id) { return tx('readonly', (s) => s.get(id)); }
export function del(id) { return tx('readwrite', (s) => s.delete(id)); }
export function all() { return tx('readonly', (s) => s.getAll()); }
export function keys() { return tx('readonly', (s) => s.getAllKeys()); }

/** Total bytes of every stored photo. */
export async function bytes() {
  try {
    const list = await all();
    return list.reduce((n, r) => n + (r.bytes || (r.dataURL || '').length), 0);
  } catch { return 0; }
}

/** Deletes any photo no record points at any more. */
export async function gc(usedIds) {
  try {
    const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);
    const ids = await keys();
    const dead = ids.filter((id) => !used.has(id));
    await Promise.all(dead.map((id) => del(id)));
    return dead.length;
  } catch { return 0; }
}

/** Bulk import from a backup file. Existing ids are left alone. */
export async function importAll(list) {
  if (!Array.isArray(list) || !list.length) return 0;
  let n = 0;
  for (const r of list) {
    if (!r || !r.id || !r.dataURL) continue;
    try { await put(r); n++; } catch { /* keep going - one bad photo is not fatal */ }
  }
  return n;
}

/* ---------- picking files ---------- */

/** Opens the system picker (camera or library on iOS). Resolves to File[]. */
export function pickFiles({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (multiple) inp.multiple = true;
    inp.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(inp);
    let settled = false;
    inp.addEventListener('change', () => {
      settled = true;
      const files = [...(inp.files || [])];
      inp.remove();
      resolve(files);
    });
    // iOS fires no event when the picker is dismissed
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!settled) { inp.remove(); resolve([]); } }, 700);
    }, { once: true });
    inp.click();
  });
}

/* ---------- processing ---------- */

export const STYLES = [
  { id: 'photo',  label: 'Photo',    max: 900, quant: 0,  note: 'as taken, just smaller' },
  { id: 'pixel',  label: 'Pixelate', max: 220, quant: 0,  note: 'chunky pixels, real colours' },
  { id: 'runes',  label: 'Grimoire', max: 160, quant: 1,  note: 'mapped to the 8-bit palette' },
];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

const PAL_RGB = Object.values(PAL).map((hex) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
]);

// 4x4 Bayer matrix - dithering keeps gradients readable in a 21-colour palette
const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

function quantise(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const bias = (BAYER[y & 3][x & 3] / 16 - 0.5) * 40;
      const r = Math.max(0, Math.min(255, d[i] + bias));
      const g = Math.max(0, Math.min(255, d[i + 1] + bias));
      const b = Math.max(0, Math.min(255, d[i + 2] + bias));
      let best = 0, bestD = Infinity;
      for (let p = 0; p < PAL_RGB.length; p++) {
        const c = PAL_RGB[p];
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (dist < bestD) { bestD = dist; best = p; }
      }
      d[i] = PAL_RGB[best][0]; d[i + 1] = PAL_RGB[best][1]; d[i + 2] = PAL_RGB[best][2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Shrinks and (optionally) palette-maps a picture.
 * Returns {dataURL, w, h, bytes} - never the original file.
 */
export async function process(file, styleId = 'photo') {
  const style = STYLES.find((s) => s.id === styleId) || STYLES[0];
  const img = await loadImage(file);
  const scale = Math.min(1, style.max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: style.quant === 1 });
  ctx.imageSmoothingEnabled = styleId === 'photo';
  ctx.drawImage(img, 0, 0, w, h);
  if (style.quant) quantise(ctx, w, h);

  // palette art keeps its flat colours in png; photographs are far
  // smaller as jpeg, and these all have to fit in one device's storage
  const dataURL = style.quant
    ? cv.toDataURL('image/png')
    : cv.toDataURL('image/jpeg', styleId === 'pixel' ? 0.82 : 0.74);

  return { dataURL, w, h, bytes: Math.round(dataURL.length * 0.75), style: styleId };
}

/* ---------- rendering helpers ---------- */

export function thumbHTML(rec, { cls = '' } = {}) {
  if (!rec) return '';
  return `<img class="photo__img ${cls}" src="${rec.dataURL}" width="${rec.w}" height="${rec.h}"
    alt="${(rec.name || 'photo').replace(/"/g, '')}" loading="lazy" decoding="async">`;
}
