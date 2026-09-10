/* ============================================================
   GRIMOIRE - markup.js
   A very small markdown-ish reader for scrolls and chronicle
   entries. It only understands what the rune bar can write:
   headings, bullets, numbers, tasks, quotes, rules, tables and
   a little inline emphasis. Anything else stays plain text.
   ============================================================ */

import { esc } from './ui.js';

/* ---------- inline ---------- */

function inline(raw) {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return s;
}

/* ---------- block ---------- */

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function table(lines, start) {
  let i = start;
  const rows = [];
  while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i]); i++; }
  if (rows.length < 2 || !isTableRule(rows[1])) return null;

  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const html = `<div class="md__tablewrap"><table class="md__table">
      <thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>
      <tbody>${body.map((r) => `<tr>${
        head.map((_, ci) => `<td>${inline(r[ci] ?? '')}</td>`).join('')
      }</tr>`).join('')}</tbody>
    </table></div>`;
  return { html, next: i };
}

/**
 * Renders the grimoire's plain text into HTML.
 * `taskIndex` numbers the checkboxes so the reader can tick them.
 */
export function render(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let task = 0;

  const flushList = (tag, items, cls = '') => {
    if (!items.length) return;
    out.push(`<${tag} class="md__list ${cls}">${items.join('')}</${tag}>`);
    items.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    if (/^\s*(---+|\*\*\*+|===+)\s*$/.test(line)) { out.push('<hr class="md__rule">'); i++; continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length + 1;   // h2..h4 - the view owns h1
      out.push(`<h${lvl} class="md__h md__h--${h[1].length}">${inline(h[2])}</h${lvl}>`);
      i++; continue;
    }

    if (isTableRow(line)) {
      const t = table(lines, i);
      if (t) { out.push(t.html); i = t.next; continue; }
    }

    // task list
    if (/^\s*[-*]\s*\[( |x|X)\]\s?/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s*\[( |x|X)\]\s?/.test(lines[i])) {
        const m = /^\s*[-*]\s*\[( |x|X)\]\s?(.*)$/.exec(lines[i]);
        const done = m[1].toLowerCase() === 'x';
        items.push(`<li class="md__task ${done ? 'is-done' : ''}">
            <button type="button" class="md__box" data-task="${task++}"
              aria-pressed="${done}">${done ? '&#10003;' : ''}</button>
            <span>${inline(m[2])}</span></li>`);
        i++;
      }
      flushList('ul', items, 'md__list--tasks');
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s*\[/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      flushList('ul', items);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
        i++;
      }
      flushList('ol', items);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(inline(lines[i].replace(/^\s*>\s?/, '')));
        i++;
      }
      out.push(`<blockquote class="md__quote">${buf.join('<br>')}</blockquote>`);
      continue;
    }

    // plain paragraph - consecutive plain lines stay together
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^\s*(#{1,3}\s|[-*]\s|\d+[.)]\s|>\s?|\||---+$|\*\*\*+$|===+$)/.test(lines[i])) {
      buf.push(inline(lines[i]));
      i++;
    }
    if (buf.length) out.push(`<p class="md__p">${buf.join('<br>')}</p>`);
    else i++;   // nothing matched - never spin
  }

  return out.join('') || '<p class="md__empty">Nothing written yet.</p>';
}

/** Strips the markup for list previews and search excerpts. */
export function plain(text) {
  return String(text || '')
    .replace(/^\s*#{1,3}\s+/gm, '')
    .replace(/^\s*[-*]\s*\[( |x|X)\]\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(---+|\*\*\*+|===+)\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Flips the nth `- [ ]` on or off inside the raw text.
 * Returns the new text, or null when that box is not there.
 */
export function toggleTask(text, index) {
  const lines = String(text || '').split('\n');
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*[-*]\s*\[)( |x|X)(\]\s?.*)$/.exec(lines[i]);
    if (!m) continue;
    if (n === index) {
      lines[i] = `${m[1]}${m[2].toLowerCase() === 'x' ? ' ' : 'x'}${m[3]}`;
      return lines.join('\n');
    }
    n++;
  }
  return null;
}
