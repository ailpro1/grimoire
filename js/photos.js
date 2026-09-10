/* ============================================================
   GRIMOIRE - photos.js
   Attaching pictures to scrolls and chronicle entries.
   Pictures are shrunk (and optionally palette-mapped) before
   they are stored, and they never leave the device.
   ============================================================ */

import * as S from './store.js';
import * as U from './ui.js';
import * as Au from './audio.js';
import * as M from './media.js';
import { icon } from './sprites.js';

/* ---------- choosing a treatment ---------- */

async function styleFlow(files) {
  const first = files[0];
  const previews = {};
  for (const st of M.STYLES) {
    try { previews[st.id] = await M.process(first, st.id); } catch { previews[st.id] = null; }
  }
  if (!previews.photo && !previews.pixel && !previews.runes) {
    U.notify.err('That file is not a picture this device can read');
    return null;
  }

  return U.dialog({
    title: files.length > 1 ? `${files.length} pictures` : 'Add a picture',
    subtitle: 'How should it look?',
    size: 'lg',
    render: (body) => {
      body.innerHTML = `
        <div class="phstyles">
          ${M.STYLES.map((st, i) => `
            <button type="button" class="phstyle ${i === 1 ? 'is-on' : ''}" data-style="${st.id}">
              <span class="phstyle__shot">${previews[st.id]
                ? `<img src="${previews[st.id].dataURL}" alt="">` : ''}</span>
              <b>${U.esc(st.label)}</b>
              <em>${U.esc(st.note)}</em>
              <small>${previews[st.id] ? S.fmtBytes(previews[st.id].bytes) : '-'}</small>
            </button>`).join('')}
        </div>
        <p class="field__hint">Stored on this device only, at the size shown.
        Big albums belong in Photos - this is for a few reference shots.</p>`;
      body.dataset.value = 'pixel';
      body.querySelectorAll('.phstyle').forEach((b) => b.addEventListener('click', () => {
        Au.play('select');
        body.querySelectorAll('.phstyle').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        body.dataset.value = b.dataset.style;
      }));
    },
    buttons: [
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      { label: 'Attach', cls: 'btn--gold',
        onClick: (body, close) => close(body.dataset.value || 'pixel') },
    ],
  }).then((v) => (v == null ? null : v));
}

/**
 * Pick -> treat -> store. Returns how many were attached.
 * kind: 'note' | 'journal'; id: note id or journal date.
 */
export async function attachFlow(kind, id) {
  if (!M.available()) {
    U.notify.err('This browser cannot store pictures offline');
    return 0;
  }
  const files = (await M.pickFiles()).filter((f) => /^image\//.test(f.type));
  if (!files.length) return 0;
  if (files.length > 12) files.length = 12;

  const style = await styleFlow(files);
  if (!style) return 0;

  let n = 0;
  for (const f of files) {
    try {
      const out = await M.process(f, style);
      const mediaId = S.uid();
      await M.put({
        id: mediaId, dataURL: out.dataURL, w: out.w, h: out.h,
        bytes: out.bytes, name: f.name || 'photo', style, addedAt: Date.now(),
      });
      S.addAttachment(kind, id, {
        id: mediaId, name: f.name || 'photo', w: out.w, h: out.h,
        bytes: out.bytes, style, addedAt: Date.now(),
      });
      n++;
    } catch (e) {
      console.warn('[grimoire] could not attach', e);
    }
  }

  if (n) { Au.play('chest'); U.notify.ok(`${n} picture${n === 1 ? '' : 's'} attached`); }
  else U.notify.err('Nothing could be attached');
  return n;
}

/* ---------- the strip under the editor ---------- */

export function galleryShell() {
  return '<div class="photos" data-photos hidden></div>';
}

/** Fills the strip from IndexedDB and wires taps. Safe to call again. */
export async function mountGallery(root, kind, id, { onChange = null } = {}) {
  const host = root.querySelector('[data-photos]');
  if (!host) return;
  const metas = S.attachmentsOf(kind, id);
  if (!metas.length) { host.hidden = true; host.innerHTML = ''; return; }

  const recs = [];
  for (const m of metas) {
    try {
      const r = await M.get(m.id);
      if (r) recs.push({ ...m, ...r });
    } catch { /* one missing picture must not blank the strip */ }
  }
  if (!recs.length) { host.hidden = true; host.innerHTML = ''; return; }

  host.hidden = false;
  const total = recs.reduce((n, r) => n + (r.bytes || 0), 0);
  host.innerHTML = `
    <div class="photos__head">
      ${icon('chest', 2)}
      <span>${recs.length} picture${recs.length === 1 ? '' : 's'}</span>
      <em>${S.fmtBytes(total)}</em>
    </div>
    <div class="photos__strip">
      ${recs.map((r, i) => `
        <button type="button" class="photo" data-photo="${i}" aria-label="${U.esc(r.name || 'photo')}">
          <img src="${r.dataURL}" alt="" loading="lazy" decoding="async">
        </button>`).join('')}
    </div>`;

  host.querySelectorAll('[data-photo]').forEach((b) => {
    b.addEventListener('click', async () => {
      Au.play('open');
      const changed = await viewer(recs, Number(b.dataset.photo), kind, id);
      if (changed) {
        await mountGallery(root, kind, id, { onChange });
        onChange?.();
      }
    });
  });
}

/* ---------- full-screen viewer ---------- */

function viewer(recs, index, kind, id) {
  let i = index;
  let changed = false;

  return U.dialog({
    title: '',
    size: 'lg',
    variant: 'panel',
    render: (body, close) => {
      const draw = () => {
        const r = recs[i];
        if (!r) { close(); return; }
        body.innerHTML = `
          <div class="lightbox">
            <div class="lightbox__frame ${r.style === 'photo' ? '' : 'is-pixel'}">
              <img src="${r.dataURL}" alt="${U.esc(r.name || 'photo')}">
            </div>
            <p class="lightbox__meta">
              ${U.esc(r.name || 'photo')} · ${r.w}&times;${r.h} · ${S.fmtBytes(r.bytes || 0)}
            </p>
            <div class="lightbox__nav">
              <button type="button" class="btn btn--sm btn--ghost" data-go="-1"
                ${i === 0 ? 'disabled' : ''}>&#9666;</button>
              <span>${i + 1} / ${recs.length}</span>
              <button type="button" class="btn btn--sm btn--ghost" data-go="1"
                ${i === recs.length - 1 ? 'disabled' : ''}>&#9656;</button>
            </div>
            <button type="button" class="btn btn--danger btn--wide" data-drop>Remove picture</button>
          </div>`;

        body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
          Au.play('move');
          i = Math.max(0, Math.min(recs.length - 1, i + Number(b.dataset.go)));
          draw();
        }));

        body.querySelector('[data-drop]').addEventListener('click', async () => {
          const ok = await U.confirmBox({
            title: 'Remove this picture?',
            text: 'It is deleted from this device. The scroll text is untouched.',
            confirmLabel: 'Remove', danger: true, icon: 'skull',
          });
          if (!ok) return;
          S.removeAttachment(kind, id, recs[i].id);
          recs.splice(i, 1);
          changed = true;
          Au.play('trash');
          if (!recs.length) { close(); return; }
          i = Math.min(i, recs.length - 1);
          draw();
        });
      };
      draw();
    },
    buttons: [{ label: 'Close', value: true, cls: 'btn--ghost' }],
  }).then(() => changed);
}

/* ---------- storage figure for Options ---------- */

export async function usage() {
  try {
    const bytes = await M.bytes();
    const count = (await M.keys()).length;
    return { bytes, count };
  } catch { return { bytes: 0, count: 0 }; }
}
