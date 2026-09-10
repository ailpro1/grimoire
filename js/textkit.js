/* ============================================================
   GRIMOIRE - textkit.js
   The rune bar. Every button acts on the text there and then -
   a bullet becomes a bullet, a table becomes a table. There is
   no markup to type and no reading mode to switch to; what is
   written to disk is still plain text (see richtext.js).
   ============================================================ */

import * as S from './store.js';
import * as U from './ui.js';
import * as Au from './audio.js';
import * as R from './richtext.js';
import { icon } from './sprites.js';

/* ---------- table builder ---------- */

async function tableFlow(el) {
  const spec = await U.dialog({
    title: 'Build a table',
    size: 'md',
    render: (body) => {
      body.innerHTML = `
        <label class="field__label">Columns</label>
        <div class="stepper" data-k="cols">
          <button type="button" class="btn btn--sm btn--ghost" data-step="-1">&#8722;</button>
          <b class="stepper__n">2</b>
          <button type="button" class="btn btn--sm btn--ghost" data-step="1">+</button>
        </div>
        <label class="field__label">Rows (not counting the header)</label>
        <div class="stepper" data-k="rows">
          <button type="button" class="btn btn--sm btn--ghost" data-step="-1">&#8722;</button>
          <b class="stepper__n">2</b>
          <button type="button" class="btn btn--sm btn--ghost" data-step="1">+</button>
        </div>
        <label class="field__label" for="tb-head">Column headings (comma separated)</label>
        <input id="tb-head" class="field" type="text" placeholder="Part, Qty, Note"
          autocapitalize="words" autocomplete="off">
        <p class="field__hint">Tap any cell afterwards to fill it in. The table
        button offers rows and columns once the caret is inside one.</p>`;

      body.querySelectorAll('.stepper').forEach((st) => {
        const n = st.querySelector('.stepper__n');
        st.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
          Au.play('move');
          const max = st.dataset.k === 'cols' ? 6 : 20;
          n.textContent = String(Math.max(1, Math.min(max, Number(n.textContent) + Number(b.dataset.step))));
        }));
      });
    },
    buttons: [
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      { label: 'Insert', cls: 'btn--gold',
        onClick: (body, close) => {
          const num = (k) => Number(body.querySelector(`.stepper[data-k="${k}"] .stepper__n`).textContent);
          const heads = body.querySelector('#tb-head').value.split(',').map((x) => x.trim()).filter(Boolean);
          close({ cols: num('cols'), rows: num('rows'), heads });
        } },
    ],
  });
  if (!spec) return;
  R.insertBlock(el, R.tableHTML(spec.rows, spec.cols, spec.heads));
  Au.play('chest');
}

async function tableMenu(el) {
  const choice = await U.sheet({
    title: 'This table',
    items: [
      { id: 'row', label: 'Add a row below', icon: 'scroll' },
      { id: 'col', label: 'Add a column right', icon: 'scroll' },
      null,
      { id: 'delrow', label: 'Delete this row', icon: 'skull', tone: 'danger' },
      { id: 'delcol', label: 'Delete this column', icon: 'skull', tone: 'danger' },
      null,
      { id: 'new', label: 'Insert another table', icon: 'chest' },
    ],
  });
  if (!choice) return false;
  if (choice === 'new') { await tableFlow(el); return true; }
  const ok = R.tableOp(el, choice);
  if (!ok) U.notify.warn('That is the last one - it has to stay');
  return ok;
}

/* ---------- date & time stamp ---------- */

const HH = (d) => S.pad2(d.getHours());
const MM = (d) => S.pad2(d.getMinutes());

function fmt12(hh, mm) {
  const h = Number(hh) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${suffix}`;
}

function stampText(iso, time, style) {
  const parts = [];
  if (iso) {
    if (style === 'iso') parts.push(iso);
    else if (style === 'long') parts.push(S.prettyDateLong(iso));
    else parts.push(S.prettyDate(iso));
  }
  if (time) {
    const [hh, mm] = time.split(':');
    parts.push(style === 'iso' ? time : fmt12(hh, mm));
  }
  return parts.join(' ');
}

/** Date & time picker. Resolves to the text to insert, or null. */
export function pickStamp({ title = 'Date & time' } = {}) {
  return U.dialog({
    title,
    size: 'md',
    render: (body) => {
      body.innerHTML = `
        <label class="field__label" for="st-date">Date</label>
        <input id="st-date" class="field field--date" type="date" value="${S.todayISO()}">
        <div class="quickdates">
          <button type="button" class="chip" data-add="0">Today</button>
          <button type="button" class="chip" data-add="1">Tomorrow</button>
          <button type="button" class="chip" data-add="7">+1 week</button>
          <button type="button" class="chip" data-add="">No date</button>
        </div>

        <label class="field__label" for="st-time">Time</label>
        <input id="st-time" class="field field--date" type="time" value="">
        <div class="quickdates">
          <button type="button" class="chip" data-time="now">Now</button>
          <button type="button" class="chip" data-time="09:00">09:00</button>
          <button type="button" class="chip" data-time="13:00">13:00</button>
          <button type="button" class="chip" data-time="">No time</button>
        </div>

        <label class="field__label">Style</label>
        <div class="segbar segbar--scroll" id="st-style">
          <button type="button" class="seg is-on" data-id="short">${U.esc(S.prettyDate(S.todayISO()))}</button>
          <button type="button" class="seg" data-id="long">${U.esc(S.prettyDateLong(S.todayISO()))}</button>
          <button type="button" class="seg" data-id="iso">${S.todayISO()}</button>
        </div>
        <p class="field__hint" id="st-preview"></p>`;

      const date = body.querySelector('#st-date');
      const time = body.querySelector('#st-time');
      const styles = body.querySelector('#st-style');
      const preview = body.querySelector('#st-preview');
      styles.dataset.value = 'short';

      const draw = () => {
        const t = stampText(date.value, time.value, styles.dataset.value);
        preview.textContent = t ? `Inserts: ${t}` : 'Nothing to insert yet';
      };

      body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        Au.play('move');
        date.value = b.dataset.add === '' ? '' : S.addDays(S.todayISO(), Number(b.dataset.add));
        draw();
      }));
      body.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => {
        Au.play('move');
        const v = b.dataset.time;
        time.value = v === 'now' ? `${HH(new Date())}:${MM(new Date())}` : v;
        draw();
      }));
      styles.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => {
        Au.play('select');
        styles.querySelectorAll('.seg').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        styles.dataset.value = b.dataset.id;
        draw();
      }));
      date.addEventListener('change', draw);
      time.addEventListener('change', draw);
      draw();
    },
    buttons: [
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      { label: 'Stamp now', cls: 'btn--ghost',
        onClick: (body, close) => {
          const d = new Date();
          close(`${S.prettyDate(S.todayISO())} ${fmt12(HH(d), MM(d))}`);
        } },
      { label: 'Insert', cls: 'btn--gold',
        onClick: (body, close) => {
          const t = stampText(
            body.querySelector('#st-date').value,
            body.querySelector('#st-time').value,
            body.querySelector('#st-style').dataset.value);
          if (!t) { Au.play('error'); return false; }
          close(t);
          return true;
        } },
    ],
  }).then((v) => (v == null ? null : v));
}

/* ---------- the bar ---------- */

const TOOLS = [
  { id: 'head',   label: 'Title',  aria: 'Heading' },
  { id: 'bold',   label: 'B',      aria: 'Bold', cls: 'is-bold' },
  { id: 'ital',   label: 'I',      aria: 'Italic', cls: 'is-ital' },
  { id: 'bullet', label: '• List', aria: 'Bullet list' },
  { id: 'number', label: '1. List', aria: 'Numbered list' },
  { id: 'task',   label: '☑ Task', aria: 'Tick boxes' },
  { id: 'quote',  label: '“ Quote', aria: 'Quote' },
  { id: 'table',  label: '▦ Table', aria: 'Table' },
  { id: 'rule',   label: '— Line', aria: 'Divider' },
  { id: 'stamp',  label: 'Date',   aria: 'Date and time', icon: 'clock' },
  { id: 'photo',  label: 'Photo',  aria: 'Attach a photo', icon: 'chest' },
  { id: 'help',   label: '?',      aria: 'What the runes do' },
];

export function runebar({ photos = true } = {}) {
  const tools = TOOLS.filter((t) => photos || t.id !== 'photo');
  return `<div class="runebar" role="toolbar" aria-label="Text tools">
      ${tools.map((t) => `<button type="button" class="rune ${t.cls || ''}"
          data-rune="${t.id}" aria-label="${U.esc(t.aria)}" title="${U.esc(t.aria)}">
          ${t.icon ? icon(t.icon, 2) : ''}<span>${t.label}</span>
        </button>`).join('')}
    </div>`;
}

function helpDialog() {
  return U.dialog({
    title: 'The runes',
    size: 'lg',
    render: `<div class="md md--help">
        <p class="md__p">Put the caret where you want it, or select some words,
        then tap a rune. What you see is what the scroll is.</p>
        <ul class="md__list">
          <li><b>Title</b> - makes the line a heading; tap again for a smaller
          one, again to put it back to normal.</li>
          <li><b>B</b> and <b>I</b> - bold and italic, on the selection or the
          word being typed.</li>
          <li><b>List</b>, <b>1. List</b>, <b>Task</b> - turn the lines into
          bullets, numbers or tick boxes. Tap a box to tick it. Enter on an
          empty item leaves the list.</li>
          <li><b>Quote</b> and <b>Line</b> - an indented quote, or a divider
          across the scroll.</li>
          <li><b>Table</b> - choose the size, then tap any cell to fill it. With
          the caret inside a table the same rune adds or removes rows and
          columns.</li>
          <li><b>Date</b> - a date, a time, or both, in the style you pick.</li>
          <li><b>Photo</b> - a picture from the camera or the library.</li>
        </ul>
        <p class="md__p">Underneath, a scroll is still stored as plain text, so
        copying one out gives you something readable anywhere.</p>
      </div>`,
    buttons: [{ label: 'Got it', value: true, cls: 'btn--gold' }],
  });
}

/**
 * Wires a rune bar to a contenteditable.
 * `onEdit` is called whenever the text changed, `onPhoto` for the camera.
 */
export function bindRunebar(root, editable, { onPhoto = null, onEdit = () => {} } = {}) {
  // a button that takes focus takes the caret with it, and the command
  // would then have nothing to act on
  ['mousedown', 'pointerdown'].forEach((ev) => root.addEventListener(ev, (e) => {
    if (e.target.closest('[data-rune]')) e.preventDefault();
  }));

  U.bind(root, '[data-rune]', async (el) => {
    const id = el.dataset.rune;

    if (id === 'photo') { if (onPhoto) await onPhoto(); return; }
    if (id === 'help') { await helpDialog(); return; }

    if (id === 'table') {
      const changed = R.inTable(editable) ? await tableMenu(editable) : (await tableFlow(editable), true);
      if (changed) onEdit();
      return;
    }

    if (id === 'stamp') {
      const t = await pickStamp();
      if (!t) return;
      R.insertText(editable, t);
      Au.play('coin');
      onEdit();
      return;
    }

    if (R.apply(editable, id)) onEdit();
  }, 'select');
}
