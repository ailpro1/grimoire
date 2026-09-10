/* ============================================================
   GRIMOIRE - textkit.js
   The rune bar: bullets, numbers, tasks, headings, quotes,
   rules, tables and a date & time stamp, all written straight
   into the textarea as plain text so nothing is ever locked
   inside a rich-text format.
   ============================================================ */

import * as S from './store.js';
import * as U from './ui.js';
import * as Au from './audio.js';
import { icon } from './sprites.js';

/* ---------- textarea surgery ---------- */

/** Writes text over the current selection, keeping native undo where we can. */
function put(ta, text, { start = null, end = null, caret = null, select = null } = {}) {
  const s = start ?? ta.selectionStart;
  const e = end ?? ta.selectionEnd;
  ta.focus();
  ta.setSelectionRange(s, e);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok) {
    const before = ta.value.slice(0, s);
    const after = ta.value.slice(e);
    ta.value = before + text + after;
  }
  if (select) ta.setSelectionRange(s + select[0], s + select[1]);
  else {
    const pos = caret == null ? s + text.length : s + caret;
    ta.setSelectionRange(pos, pos);
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Start/end of the whole lines the selection touches. */
function lineRange(ta) {
  const v = ta.value;
  let s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let e = v.indexOf('\n', ta.selectionEnd);
  if (e === -1) e = v.length;
  return { s, e, lines: v.slice(s, e).split('\n') };
}

const PREFIX_RE = /^(\s*)(?:[-*]\s\[[ xX]\]\s?|[-*]\s+|\d+[.)]\s+|>\s?|#{1,3}\s+)/;

function stripPrefix(line) {
  const m = PREFIX_RE.exec(line);
  return m ? m[1] + line.slice(m[0].length) : line;
}

/**
 * Adds a line prefix to every selected line, or takes it off again
 * when they all have it already. `prefix` may be a function of index.
 */
function toggleLines(ta, prefix, test) {
  const { s, e, lines } = lineRange(ta);
  const written = lines.filter((l) => l.trim());
  // an empty line always gets the prefix; a set of written lines only
  // loses it when every one of them already has it
  const on = written.length > 0 && written.every(test);
  const next = lines.map((l, i) => {
    if (!l.trim() && written.length) return l;
    const bare = stripPrefix(l);
    if (on) return bare;
    const indent = /^\s*/.exec(bare)[0];
    return indent + (typeof prefix === 'function' ? prefix(i) : prefix) + bare.slice(indent.length);
  });
  put(ta, next.join('\n'), { start: s, end: e });
  return !on;
}

function wrap(ta, before, after = before, placeholder = 'text') {
  let s = ta.selectionStart, e = ta.selectionEnd;
  // nothing selected but the caret sits in a word - emphasise that word,
  // which is how anyone actually uses this on a phone
  if (s === e) {
    const v = ta.value;
    let a = s, b = s;
    while (a > 0 && /\S/.test(v[a - 1])) a--;
    while (b < v.length && /\S/.test(v[b])) b++;
    if (b > a) { s = a; e = b; }
  }
  const sel = ta.value.slice(s, e);
  if (sel) put(ta, before + sel + after, { start: s, end: e });
  // nothing selected: drop in a placeholder and select it, so the
  // next keystroke replaces the word rather than landing beside it
  else put(ta, before + placeholder + after,
    { start: s, end: e, select: [before.length, before.length + placeholder.length] });
}

/** Drops a block on its own lines below the caret. */
function block(ta, text) {
  const s = ta.selectionStart;
  const lead = s === 0 || ta.value[s - 1] === '\n' ? '' : '\n';
  put(ta, `${lead}${text}\n`, { start: s, end: ta.selectionEnd });
}

/* ---------- table builder ---------- */

function tableText(rows, cols, headers) {
  const width = 10;
  const pad = (t) => ` ${String(t).padEnd(width - 2)} `;
  const head = `|${headers.slice(0, cols).map(pad).join('|')}|`;
  const rule = `|${Array.from({ length: cols }, () => '-'.repeat(width)).join('|')}|`;
  const body = Array.from({ length: rows }, () =>
    `|${Array.from({ length: cols }, () => pad('')).join('|')}|`);
  return [head, rule, ...body].join('\n');
}

async function tableFlow(ta) {
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
        <p class="field__hint">A plain-text table. It lines up in the reader.</p>`;

      body.querySelectorAll('.stepper').forEach((st) => {
        const n = st.querySelector('.stepper__n');
        st.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
          Au.play('move');
          const min = 1, max = st.dataset.k === 'cols' ? 6 : 20;
          n.textContent = String(Math.max(min, Math.min(max, Number(n.textContent) + Number(b.dataset.step))));
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
  const heads = Array.from({ length: spec.cols }, (_, i) => spec.heads[i] || `Col ${i + 1}`);
  block(ta, tableText(spec.rows, spec.cols, heads));
  Au.play('chest');
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
  const now = new Date();
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

/* ---------- the bar itself ---------- */

const TOOLS = [
  { id: 'head',   label: 'H',     aria: 'Heading' },
  { id: 'bold',   label: 'B',     aria: 'Bold', cls: 'is-bold' },
  { id: 'ital',   label: 'I',     aria: 'Italic', cls: 'is-ital' },
  { id: 'bullet', label: '• List', aria: 'Bullet list' },
  { id: 'number', label: '1. List', aria: 'Numbered list' },
  { id: 'task',   label: '☑ Task', aria: 'Checklist' },
  { id: 'quote',  label: '“ Quote', aria: 'Quote' },
  { id: 'table',  label: '▦ Table', aria: 'Table' },
  { id: 'rule',   label: '— Line', aria: 'Divider' },
  { id: 'stamp',  label: 'Date', aria: 'Date and time', icon: 'clock' },
  { id: 'photo',  label: 'Photo', aria: 'Attach a photo', icon: 'chest' },
  { id: 'help',   label: '?', aria: 'What the runes do' },
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
        <p class="md__p">Everything is stored as plain text, so a scroll stays readable
        anywhere. Tap <b>READ</b> to see it laid out.</p>
        <table class="md__table">
          <thead><tr><th>You write</th><th>You get</th></tr></thead>
          <tbody>
            <tr><td># Title</td><td>a heading</td></tr>
            <tr><td>- milk</td><td>a bullet</td></tr>
            <tr><td>1. first</td><td>a numbered list</td></tr>
            <tr><td>- [ ] job</td><td>a tickable box</td></tr>
            <tr><td>&gt; said the king</td><td>a quote</td></tr>
            <tr><td>---</td><td>a divider</td></tr>
            <tr><td>| a | b |</td><td>a table row</td></tr>
            <tr><td>**bold** *italic*</td><td>emphasis</td></tr>
          </tbody>
        </table>
      </div>`,
    buttons: [{ label: 'Got it', value: true, cls: 'btn--gold' }],
  });
}

/**
 * Wires a rune bar to a textarea.
 * `onPhoto` is called when the photo rune is tapped (optional).
 */
export function bindRunebar(root, ta, { onPhoto = null } = {}) {
  U.bind(root, '[data-rune]', async (el) => {
    const id = el.dataset.rune;
    switch (id) {
      case 'head':
        toggleLines(ta, '# ', (l) => /^\s*#{1,3}\s+/.test(l));
        break;
      case 'bold': wrap(ta, '**', '**', 'bold'); break;
      case 'ital': wrap(ta, '*', '*', 'italic'); break;
      case 'bullet':
        toggleLines(ta, '- ', (l) => /^\s*[-*]\s+/.test(l) && !/^\s*[-*]\s*\[/.test(l));
        break;
      case 'number':
        toggleLines(ta, (i) => `${i + 1}. `, (l) => /^\s*\d+[.)]\s+/.test(l));
        break;
      case 'task':
        toggleLines(ta, '- [ ] ', (l) => /^\s*[-*]\s*\[[ xX]\]/.test(l));
        break;
      case 'quote':
        toggleLines(ta, '> ', (l) => /^\s*>\s?/.test(l));
        break;
      case 'rule': block(ta, '---'); break;
      case 'table': await tableFlow(ta); break;
      case 'stamp': {
        const t = await pickStamp();
        if (t) { put(ta, t); Au.play('coin'); }
        break;
      }
      case 'photo': if (onPhoto) await onPhoto(); break;
      case 'help': await helpDialog(); break;
    }
  }, 'select');
}

/**
 * Continues a list when Enter is pressed at the end of one -
 * the small courtesy that makes bullets usable on a phone.
 */
export function autoList(ta) {
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const s = ta.selectionStart;
    if (s !== ta.selectionEnd) return;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    const line = ta.value.slice(lineStart, s);
    const m = /^(\s*)([-*]\s\[[ xX]\]\s|[-*]\s|(\d+)[.)]\s)(.*)$/.exec(line);
    if (!m) return;
    e.preventDefault();
    if (!m[4].trim()) {           // empty item - end the list instead
      put(ta, '\n', { start: lineStart, end: s });
      return;
    }
    let marker = m[2];
    if (m[3]) marker = `${Number(m[3]) + 1}. `;
    else if (/\[[xX]\]/.test(marker)) marker = marker.replace(/\[[xX]\]/, '[ ]');
    put(ta, `\n${m[1]}${marker}`);
  });
}
