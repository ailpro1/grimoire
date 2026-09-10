/* ============================================================
   GRIMOIRE - richtext.js
   The scroll and chronicle editors are contenteditable: what you
   see while writing is the finished thing, with no markup
   characters and no reading mode to switch to.

   What is *stored* is still plain text - the same small markup
   markup.js reads - so search, previews, copying out and old
   backups all keep working, and nothing is ever locked inside
   an HTML blob.
   ============================================================ */

import { render } from './markup.js';
import { esc } from './ui.js';

try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* older engine */ }

/* ---------- markup -> editable HTML ---------- */

export function toHTML(markup) {
  const text = String(markup || '').trim();
  if (!text) return '<p class="md__p"><br></p>';
  return render(text);
}

/* ---------- editable HTML -> markup ---------- */

const INLINE_WRAP = {
  B: '**', STRONG: '**',
  I: '*', EM: '*',
  S: '~~', STRIKE: '~~', DEL: '~~',
  CODE: '`',
};

function inlineOf(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' '); return; }
    if (n.nodeType !== 1) return;
    if (n.tagName === 'BR') { out += '\n'; return; }
    if (n.classList?.contains('md__box')) return;      // the tick box itself
    const wrap = INLINE_WRAP[n.tagName];
    const inner = inlineOf(n);
    if (!inner.trim()) { out += inner; return; }
    out += wrap ? `${wrap}${inner}${wrap}` : inner;
  });
  return out;
}

const cell = (el) => inlineOf(el).replace(/\s*\n\s*/g, ' ').trim() || ' ';

function tableLines(table) {
  const heads = [...table.querySelectorAll('thead th')].map(cell);
  const rows = [...table.querySelectorAll('tbody tr')]
    .map((tr) => [...tr.children].map(cell));
  const cols = Math.max(heads.length, ...rows.map((r) => r.length), 1);
  const width = 8;
  const pad = (t) => ` ${String(t).trim().padEnd(width)} `;
  const line = (cells) => `|${Array.from({ length: cols },
    (_, i) => pad(cells[i] ?? '')).join('|')}|`;
  return [
    line(heads),
    `|${Array.from({ length: cols }, () => '-'.repeat(width + 2)).join('|')}|`,
    ...rows.map(line),
  ];
}

function listLines(list, depth = 0) {
  const out = [];
  const ordered = list.tagName === 'OL';
  let n = 0;
  [...list.children].forEach((li) => {
    if (li.tagName !== 'LI') return;
    n++;
    const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    const clone = li.cloneNode(true);
    [...clone.children].forEach((c) => {
      if (c.tagName === 'UL' || c.tagName === 'OL') c.remove();
    });
    const text = inlineOf(clone).replace(/\s*\n\s*/g, ' ').trim();
    const indent = '  '.repeat(depth);
    if (li.dataset.task !== undefined) {
      out.push(`${indent}- [${li.dataset.task === 'x' ? 'x' : ' '}] ${text}`);
    } else if (ordered) {
      out.push(`${indent}${n}. ${text}`);
    } else {
      out.push(`${indent}- ${text}`);
    }
    nested.forEach((sub) => out.push(...listLines(sub, depth + 1)));
  });
  return out;
}

function blockLines(node, out) {
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.replace(/ /g, ' ');
      if (t.trim()) out.push(t.trim());
      return;
    }
    if (n.nodeType !== 1) return;

    switch (n.tagName) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const level = Math.min(3, Math.max(1, Number(n.tagName[1]) - 1));
        out.push(`${'#'.repeat(level)} ${inlineOf(n).replace(/\n/g, ' ').trim()}`);
        break;
      }
      case 'UL': case 'OL':
        out.push(...listLines(n));
        break;
      case 'BLOCKQUOTE': {
        // the stored markup has no nesting, so anything structural
        // inside a quote (a list, a table, a rule) is written out
        // after it rather than swallowed as quoted text
        const quoted = n.cloneNode(true);
        const trailing = [...quoted.querySelectorAll('ul, ol, table, hr')]
          .filter((el) => !el.parentElement.closest('ul, ol, table'));
        trailing.forEach((el) => el.remove());
        const inner = [];
        blockLines(quoted, inner);
        if (!inner.length && !trailing.length) inner.push('');
        inner.forEach((l) => out.push(`> ${l}`.trimEnd()));
        trailing.forEach((el) => {
          const holder = document.createElement('div');
          holder.appendChild(el);
          blockLines(holder, out);
        });
        break;
      }
      case 'HR':
        out.push('---');
        break;
      case 'TABLE':
        out.push(...tableLines(n));
        break;
      case 'BR':
        out.push('');
        break;
      case 'P': case 'DIV': {
        // a wrapper full of blocks, or a paragraph of its own
        const hasBlocks = [...n.children].some((c) =>
          /^(H[1-6]|UL|OL|BLOCKQUOTE|HR|TABLE|P|DIV)$/.test(c.tagName));
        if (hasBlocks) { blockLines(n, out); break; }
        const text = inlineOf(n);
        text.split('\n').forEach((l) => out.push(l.trimEnd()));
        break;
      }
      default: {
        const text = inlineOf(n);
        if (text.trim()) out.push(text.trim());
      }
    }
  });
}

/** The editable's content as the plain text the grimoire stores. */
export function toMarkup(root) {
  const out = [];
  blockLines(root, out);
  return out.join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------- housekeeping inside the editable ---------- */

const BOX = (done) => `<button type="button" contenteditable="false" class="md__box" ` +
  `aria-pressed="${done}">${done ? '&#10003;' : ''}</button>`;

/**
 * Browsers copy a list item's contents when Enter is pressed, so tick
 * boxes multiply or go missing. This puts every item back in order and
 * makes sure the editable is never completely empty.
 */
export function normalise(root) {
  root.querySelectorAll('li').forEach((li) => {
    const boxes = [...li.querySelectorAll(':scope > .md__box')];
    const isTask = li.dataset.task !== undefined || boxes.length > 0;
    if (!isTask) { boxes.forEach((b) => b.remove()); return; }

    if (li.dataset.task === undefined) li.dataset.task = '';
    const done = li.dataset.task === 'x';
    boxes.slice(1).forEach((b) => b.remove());
    let box = boxes[0];
    if (!box) {
      li.insertAdjacentHTML('afterbegin', BOX(done));
      box = li.querySelector(':scope > .md__box');
    }
    if (box !== li.firstChild) li.insertBefore(box, li.firstChild);
    box.setAttribute('aria-pressed', String(done));
    box.innerHTML = done ? '&#10003;' : '';
    li.classList.toggle('md__task', true);
    li.classList.toggle('is-done', done);
    li.closest('ul, ol')?.classList.add('md__list', 'md__list--tasks');
  });

  root.querySelectorAll('ul, ol').forEach((l) => {
    l.classList.add('md__list');
    if (!l.querySelector('li[data-task]')) l.classList.remove('md__list--tasks');
  });
  root.querySelectorAll('h2').forEach((h) => h.classList.add('md__h', 'md__h--1'));
  root.querySelectorAll('h3').forEach((h) => h.classList.add('md__h', 'md__h--2'));
  root.querySelectorAll('h4').forEach((h) => h.classList.add('md__h', 'md__h--3'));
  root.querySelectorAll('blockquote').forEach((q) => q.classList.add('md__quote'));
  root.querySelectorAll('hr').forEach((r) => r.classList.add('md__rule'));
  root.querySelectorAll('table').forEach((t) => {
    t.classList.add('md__table');
    if (!t.parentElement?.classList.contains('md__tablewrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'md__tablewrap';
      wrap.contentEditable = 'false';
      t.replaceWith(wrap);
      wrap.appendChild(t);
      t.contentEditable = 'true';
    }
  });

  // only step in when there is genuinely nothing to type into - an
  // empty heading or list item is a line someone is about to write
  if (!root.firstElementChild) root.innerHTML = '<p class="md__p"><br></p>';

  const bare = root.children.length === 1 && root.firstElementChild.tagName === 'P';
  root.classList.toggle('is-empty', bare && !root.textContent.trim());
}

/* ---------- selection helpers ---------- */

function selection() {
  const sel = window.getSelection();
  return sel && sel.rangeCount ? sel : null;
}

/* A tap on a rune can still cost the editable its caret on some
   engines, so the last place the caret was is kept and put back
   before any command runs. */
const lastRange = new WeakMap();

/* While a command runs, focus() and the selection changes it causes
   would otherwise record the browser's own idea of where the caret
   should go - which is the top of the field - over the place the
   person actually left it. */
let recording = true;

export function remember(el, force = false) {
  if (!recording && !force) return;
  const sel = selection();
  if (!sel || !el.contains(sel.anchorNode)) return;
  lastRange.set(el, sel.getRangeAt(0).cloneRange());
}

function selectionInside(el) {
  const sel = selection();
  return !!(sel && el.contains(sel.anchorNode));
}

export function restore(el) {
  const sel = window.getSelection();
  const range = lastRange.get(el);
  if (!range || !el.contains(range.commonAncestorContainer)) {
    if (selectionInside(el)) return true;
    caretTo(el.lastElementChild || el, true);
    return false;
  }
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/**
 * Focus the editable for a command. If it already had the caret, that
 * caret is left alone; if focus was somewhere else - a dialog field,
 * say - the browser picks an arbitrary spot on focus(), so the
 * remembered caret is put back instead.
 */
function focusEditable(el) {
  const kept = document.activeElement === el && selectionInside(el);
  recording = false;
  el.focus();
  if (!kept) restore(el);
  remember(el, true);
  // the focus and selectionchange events focus() queued land after
  // this turn, so tracking stays off until they have gone by
  setTimeout(() => { recording = true; }, 150);
}

/** The element the caret sits in, inside `root`. */
export function nodeAt(root, sel = selection()) {
  let n = sel?.anchorNode || null;
  if (n && n.nodeType === 3) n = n.parentElement;
  if (!n || !root.contains(n)) return null;
  return n;
}

export function blockAt(root, sel = selection()) {
  let n = nodeAt(root, sel);
  while (n && n !== root && !/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|TD|TH)$/.test(n.tagName)) {
    n = n.parentElement;
  }
  return n && n !== root ? n : null;
}

/** Puts the caret inside `el`, at its end when `atEnd`. */
export function caretTo(el, atEnd = false) {
  const sel = window.getSelection();
  if (!sel || !el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ---------- the formatting commands ---------- */

const cmd = (name, value = null) => {
  try { return document.execCommand(name, false, value); } catch { return false; }
};

/* execCommand('formatBlock') is unreliable on an empty line, which is
   exactly when someone reaches for the Title rune, so the block is
   swapped by hand instead. */
function setBlockTag(root, tag) {
  const block = blockAt(root);
  if (!block || /^(LI|TD|TH)$/.test(block.tagName)) return null;
  if (block.tagName.toLowerCase() === tag) return block;
  const el = document.createElement(tag);
  el.innerHTML = block.innerHTML || '<br>';
  block.replaceWith(el);
  return el;
}

function cycleHeading(root) {
  const block = blockAt(root);
  if (!block) return;
  const next = block.tagName === 'H2' ? 'h3' : (block.tagName === 'H3' ? 'p' : 'h2');
  const el = setBlockTag(root, next);
  normalise(root);
  if (el) caretTo(el, true);
}

function toggleQuote(root) {
  const block = blockAt(root);
  if (!block) return;
  const quote = block.closest('blockquote');
  if (quote) {
    const frag = document.createDocumentFragment();
    while (quote.firstChild) frag.appendChild(quote.firstChild);
    const first = frag.firstChild;
    quote.replaceWith(frag);
    if (first) caretTo(first, true);
    return;
  }
  const bq = document.createElement('blockquote');
  block.replaceWith(bq);
  bq.appendChild(block);
  caretTo(block, true);
}

function wrapInline(root, tag) {
  const sel = selection();
  if (!sel) return;
  const inside = nodeAt(root)?.closest(tag);
  if (inside) {                       // unwrap
    const parent = inside.parentNode;
    while (inside.firstChild) parent.insertBefore(inside.firstChild, inside);
    inside.remove();
    return;
  }
  const text = sel.toString();
  if (text) cmd('insertHTML', `<${tag}>${esc(text)}</${tag}>`);
  else cmd('insertHTML', `<${tag}>code</${tag}>`);
}

function makeTask(root) {
  let li = blockAt(root)?.closest('li');
  if (!li) {
    cmd('insertUnorderedList');
    li = blockAt(root)?.closest('li');
  }
  if (!li) return;
  if (li.dataset.task === undefined) li.dataset.task = '';
  else {
    delete li.dataset.task;                       // back to a plain bullet
    li.querySelector(':scope > .md__box')?.remove();
    li.classList.remove('md__task', 'is-done');
  }
  normalise(root);
}

export function tableHTML(rows = 2, cols = 2, heads = []) {
  const head = Array.from({ length: cols }, (_, i) =>
    `<th>${esc(heads[i] || `Col ${i + 1}`)}</th>`).join('');
  const body = Array.from({ length: rows }, () =>
    `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('');
  return `<div class="md__tablewrap" contenteditable="false">` +
    `<table class="md__table" contenteditable="true">` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="md__p"><br></p>`;
}

/** Row and column edits for the table the caret is in. */
export function tableOp(root, op) {
  focusEditable(root);
  const cellEl = nodeAt(root)?.closest('td, th');
  const table = cellEl?.closest('table');
  if (!table || !cellEl) return false;
  const index = [...cellEl.parentElement.children].indexOf(cellEl);
  const row = cellEl.parentElement;
  const body = table.querySelector('tbody');

  if (op === 'row') {
    const cols = table.querySelector('tr').children.length;
    const tr = document.createElement('tr');
    tr.innerHTML = Array.from({ length: cols }, () => '<td><br></td>').join('');
    if (row.parentElement === body) row.after(tr); else body.prepend(tr);
    caretTo(tr.firstElementChild);
  } else if (op === 'col') {
    [...table.rows].forEach((r) => {
      const c = document.createElement(r.parentElement.tagName === 'THEAD' ? 'th' : 'td');
      c.innerHTML = r.parentElement.tagName === 'THEAD' ? 'Col' : '<br>';
      r.children[index] ? r.children[index].after(c) : r.appendChild(c);
    });
  } else if (op === 'delrow') {
    if (row.parentElement !== body) return false;
    row.remove();
  } else if (op === 'delcol') {
    if (table.rows[0].children.length < 2) return false;
    [...table.rows].forEach((r) => r.children[index]?.remove());
  }
  return true;
}

export function inTable(root) {
  const live = nodeAt(root);
  if (live?.closest('table')) return true;
  const range = lastRange.get(root);
  const node = range?.commonAncestorContainer;
  const el = node?.nodeType === 3 ? node.parentElement : node;
  return !!(el && root.contains(el) && el.closest('table'));
}

/**
 * Applies one of the rune bar's commands straight to the text.
 * Returns false when the caller has more to do (tables, stamps).
 */
export function apply(root, id) {
  focusEditable(root);
  switch (id) {
    case 'bold': cmd('bold'); break;
    case 'ital': cmd('italic'); break;
    case 'strike': cmd('strikeThrough'); break;
    case 'code': wrapInline(root, 'code'); break;
    case 'head': cycleHeading(root); break;
    case 'bullet': cmd('insertUnorderedList'); break;
    case 'number': cmd('insertOrderedList'); break;
    case 'task': makeTask(root); break;
    case 'quote': toggleQuote(root); break;
    case 'rule':
      insertBlock(root, '<hr class="md__rule"><p class="md__p"><br></p>');
      break;
    default: return false;
  }
  normalise(root);
  remember(root, true);
  return true;
}

/** Drops plain text in at the caret. */
export function insertText(root, text) {
  focusEditable(root);
  cmd('insertText', text);
  remember(root, true);
}

/**
 * Puts block-level content (a table, a divider) on its own line after
 * the line the caret is on - inside a list item or at the very end of
 * the text, execCommand('insertHTML') puts it in surprising places.
 */
export function insertBlock(root, html) {
  focusEditable(root);
  const block = blockAt(root);
  // a table belongs after the whole list, not inside one of its items
  const anchor = block?.closest('li') ? block.closest('ul, ol')
    : (block?.closest('table') ? block.closest('.md__tablewrap, table') : block);

  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const nodes = [...tmp.childNodes];
  if (!nodes.length) return;

  if (anchor && anchor.parentElement === root) {
    let after = anchor;
    nodes.forEach((n) => { after.after(n); after = n; });
  } else {
    nodes.forEach((n) => root.appendChild(n));
  }

  normalise(root);
  const tail = nodes[nodes.length - 1];
  const cell = nodes.find((n) => n.nodeType === 1 && n.querySelector?.('td, th'));
  caretTo(cell ? cell.querySelector('td, th') : (tail.nodeType === 1 ? tail : root), false);
  remember(root, true);
}

/* ---------- wiring an editable up ---------- */

/**
 * Paste arrives as plain text, tick boxes tick, and the structure is
 * repaired after every edit. `onEdit` fires whenever the text changed.
 */
export function bindEditable(el, { onEdit = () => {} } = {}) {
  normalise(el);

  const track = () => remember(el);
  ['keyup', 'mouseup', 'touchend', 'input'].forEach((ev) =>
    el.addEventListener(ev, track));
  const onSelect = () => { if (document.activeElement === el) track(); };
  document.addEventListener('selectionchange', onSelect);
  el.addEventListener('grimoire:unbind', () =>
    document.removeEventListener('selectionchange', onSelect), { once: true });

  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
    cmd('insertText', text);
  });

  el.addEventListener('input', () => {
    normalise(el);
    onEdit();
  });

  el.addEventListener('click', (e) => {
    const box = e.target.closest('.md__box');
    if (!box) return;
    e.preventDefault();
    const li = box.closest('li');
    if (!li) return;
    li.dataset.task = li.dataset.task === 'x' ? '' : 'x';
    normalise(el);
    onEdit();
  });

  // Enter on an empty list item leaves the list, the way every other
  // editor behaves
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const li = blockAt(el)?.closest('li');
    if (!li) return;
    const text = li.textContent.replace(/​/g, '').trim();
    if (text) return;
    e.preventDefault();
    cmd('outdent');
    if (blockAt(el)?.closest('li')) cmd('formatBlock', 'p');
    normalise(el);
    onEdit();
  });
}
