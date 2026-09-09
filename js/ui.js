/* ============================================================
   GRIMOIRE - ui.js
   Shared interface parts: toasts, dialogs, action sheets,
   pickers, particles and the level-up ceremony.
   Everything is promise-based so views read top to bottom.
   ============================================================ */

import * as A from './audio.js';
import { icon, toSVG, ICONS, PAL } from './sprites.js';

/* ---------- tiny helpers ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function debounce(fn, ms = 250) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.flush = (...a) => { clearTimeout(t); fn(...a); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function haptic(ms = 8) { A.buzz(ms); }

let motionOn = true;
export function setMotion(on) {
  motionOn = !!on;
  document.documentElement.classList.toggle('no-motion', !on);
}
export const motion = () => motionOn &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Delegated click handling with a click sound and a press animation. */
export function bind(root, selector, handler, sound = 'select') {
  root.addEventListener('click', (e) => {
    const t = e.target.closest(selector);
    if (!t || !root.contains(t)) return;
    if (t.hasAttribute('disabled')) return;
    if (sound) A.play(sound);
    handler(t, e);
  });
}

/* ---------- layer bootstrapping ---------- */

function layer(id, cls = '') {
  let n = document.getElementById(id);
  if (!n) {
    n = document.createElement('div');
    n.id = id;
    n.className = cls;
    document.body.appendChild(n);
  }
  return n;
}

const toastLayer = () => layer('toast-layer');
const fxLayer = () => layer('fx-layer');
const dialogLayer = () => layer('dialog-layer');

/* ---------- toasts ---------- */

export function toast(message, { tone = 'info', icon: ic = null, ms = 2600 } = {}) {
  const host = toastLayer();
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  const sprite = ic ? icon(ic, 2) : '';
  el.innerHTML = `${sprite}<span>${esc(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const kill = () => {
    el.classList.remove('is-in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  };
  const timer = setTimeout(kill, ms);
  el.addEventListener('click', () => { clearTimeout(timer); kill(); });
  return kill;
}

export const notify = {
  ok:   (m, o = {}) => { A.play('save');  return toast(m, { tone: 'ok',   icon: 'star', ...o }); },
  info: (m, o = {}) => toast(m, { tone: 'info', ...o }),
  warn: (m, o = {}) => { A.play('warn');  return toast(m, { tone: 'warn', icon: 'flame', ...o }); },
  err:  (m, o = {}) => { A.play('error'); return toast(m, { tone: 'err',  icon: 'skull', ...o }); },
};

/* ---------- dialog core ---------- */

let openDialogs = 0;

function lockScroll(lock) {
  openDialogs += lock ? 1 : -1;
  openDialogs = Math.max(0, openDialogs);
  document.body.classList.toggle('is-locked', openDialogs > 0);
}

/**
 * Generic dialog. `render` receives the body element and a close()
 * callback; whatever close() is given resolves the promise.
 */
export function dialog({
  title = '', subtitle = '', render, buttons = [], size = 'md',
  dismissable = true, sound = 'open', variant = 'panel',
} = {}) {
  return new Promise((resolve) => {
    const host = dialogLayer();
    const wrap = document.createElement('div');
    wrap.className = `dlg-wrap dlg-wrap--${variant}`;
    wrap.innerHTML = `
      <div class="dlg-scrim"></div>
      <div class="dlg dlg--${size} px px-cut" role="dialog" aria-modal="true">
        ${title ? `<header class="dlg__head">
            <h2 class="dlg__title">${esc(title)}</h2>
            ${subtitle ? `<p class="dlg__sub">${esc(subtitle)}</p>` : ''}
          </header>` : ''}
        <div class="dlg__body"></div>
        ${buttons.length ? '<footer class="dlg__foot"></footer>' : ''}
      </div>`;
    host.appendChild(wrap);
    lockScroll(true);
    if (sound) A.play(sound);

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      wrap.classList.remove('is-in');
      lockScroll(false);
      A.play('close');
      setTimeout(() => wrap.remove(), motion() ? 220 : 0);
      resolve(value);
    };

    const body = wrap.querySelector('.dlg__body');
    if (typeof render === 'function') render(body, close);
    else if (typeof render === 'string') body.innerHTML = render;

    const foot = wrap.querySelector('.dlg__foot');
    if (foot) {
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn ${b.cls || ''}`.trim();
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          A.play(b.sound || (b.value === false ? 'back' : 'select'));
          if (b.onClick) {
            const r = b.onClick(body, close);
            if (r === false) return;
          }
          if (!b.keepOpen) close(b.value);
        });
        foot.appendChild(btn);
      });
    }

    if (dismissable) {
      wrap.querySelector('.dlg-scrim').addEventListener('click', () => close(undefined));
    }

    requestAnimationFrame(() => wrap.classList.add('is-in'));
    // Focus the first field so the iOS keyboard appears straight away.
    const first = body.querySelector('input, textarea');
    if (first) setTimeout(() => first.focus(), motion() ? 260 : 20);
  });
}

/* ---------- confirm ---------- */

export function confirmBox({
  title = 'Are you sure?', text = '', confirmLabel = 'Yes',
  cancelLabel = 'No', danger = false, icon: ic = null,
} = {}) {
  return dialog({
    title,
    size: 'sm',
    sound: danger ? 'warn' : 'open',
    render: `<div class="dlg-confirm">
        ${ic ? icon(ic, 3) : ''}
        <p>${esc(text)}</p>
      </div>`,
    buttons: [
      { label: cancelLabel, value: false, cls: 'btn--ghost' },
      { label: confirmLabel, value: true, cls: danger ? 'btn--danger' : 'btn--gold' },
    ],
  }).then((v) => v === true);
}

/* ---------- prompt ---------- */

export function promptBox({
  title = 'Enter', label = '', value = '', placeholder = '',
  maxlength = 120, multiline = false, confirmLabel = 'Save', hint = '',
} = {}) {
  return dialog({
    title,
    size: multiline ? 'lg' : 'md',
    render: (body) => {
      body.innerHTML = `
        ${label ? `<label class="field__label" for="dlg-in">${esc(label)}</label>` : ''}
        ${multiline
          ? `<textarea id="dlg-in" class="field field--area" rows="6"
               placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
          : `<input id="dlg-in" class="field" type="text" maxlength="${maxlength}"
               placeholder="${esc(placeholder)}" value="${esc(value)}"
               autocapitalize="sentences" autocomplete="off" spellcheck="true">`}
        ${hint ? `<p class="field__hint">${esc(hint)}</p>` : ''}`;
      const input = body.querySelector('#dlg-in');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          body.closest('.dlg').querySelector('.dlg__foot .btn--gold')?.click();
        }
      });
    },
    buttons: [
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      {
        label: confirmLabel, cls: 'btn--gold',
        onClick: (body, close) => {
          const v = body.querySelector('#dlg-in').value.trim();
          if (!v) { A.play('error'); body.querySelector('#dlg-in').classList.add('shake');
            setTimeout(() => body.querySelector('#dlg-in')?.classList.remove('shake'), 400);
            return false; }
          close(v);
          return true;
        },
      },
    ],
  }).then((v) => (v === undefined ? null : v));
}

/* ---------- action sheet (the iOS-friendly menu) ---------- */

/**
 * items: [{id, label, icon, tone, sub}] - a null entry draws a divider.
 * Resolves with the chosen id, or null.
 */
export function sheet({ title = '', subtitle = '', items = [] } = {}) {
  return new Promise((resolve) => {
    const host = dialogLayer();
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    const rows = items.map((it) => {
      if (!it) return '<div class="sheet__divider"></div>';
      return `<button type="button" class="sheet__item ${it.tone ? `is-${it.tone}` : ''}"
                data-id="${esc(it.id)}" ${it.disabled ? 'disabled' : ''}>
          <span class="sheet__ico">${it.icon ? icon(it.icon, 2) : ''}</span>
          <span class="sheet__text">
            <span class="sheet__label">${esc(it.label)}</span>
            ${it.sub ? `<span class="sheet__sub">${esc(it.sub)}</span>` : ''}
          </span>
        </button>`;
    }).join('');

    wrap.innerHTML = `
      <div class="dlg-scrim"></div>
      <div class="sheet px px-cut" role="dialog" aria-modal="true">
        ${title ? `<div class="sheet__head">
            <span class="sheet__title">${esc(title)}</span>
            ${subtitle ? `<span class="sheet__hint">${esc(subtitle)}</span>` : ''}
          </div>` : ''}
        <div class="sheet__list">${rows}</div>
        <button type="button" class="btn btn--ghost sheet__cancel">Close</button>
      </div>`;
    host.appendChild(wrap);
    lockScroll(true);
    A.play('open');

    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      wrap.classList.remove('is-in');
      lockScroll(false);
      setTimeout(() => wrap.remove(), motion() ? 240 : 0);
      resolve(v);
    };

    wrap.querySelectorAll('.sheet__item').forEach((b) => {
      b.addEventListener('click', () => { A.play('select'); close(b.dataset.id); });
    });
    wrap.querySelector('.sheet__cancel').addEventListener('click', () => { A.play('back'); close(null); });
    wrap.querySelector('.dlg-scrim').addEventListener('click', () => { A.play('back'); close(null); });

    requestAnimationFrame(() => wrap.classList.add('is-in'));
  });
}

/* ---------- option picker (radio grid) ---------- */

export function pickOne({ title = 'Choose', options = [], value = null, columns = 2 } = {}) {
  return dialog({
    title,
    render: (body) => {
      body.innerHTML = `<div class="pick" style="--cols:${columns}">
        ${options.map((o) => `
          <button type="button" class="pick__opt ${o.id === value ? 'is-on' : ''}" data-id="${esc(o.id)}">
            ${o.icon ? icon(o.icon, 2) : ''}
            ${o.svg || ''}
            <span>${esc(o.label)}</span>
          </button>`).join('')}
      </div>`;
      body.querySelectorAll('.pick__opt').forEach((b) => {
        b.addEventListener('click', () => {
          A.play('select');
          body.querySelectorAll('.pick__opt').forEach((x) => x.classList.remove('is-on'));
          b.classList.add('is-on');
          body.dataset.value = b.dataset.id;
        });
      });
      body.dataset.value = value || '';
    },
    buttons: [
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      { label: 'Choose', cls: 'btn--gold',
        onClick: (body, close) => { close(body.dataset.value || null); } },
    ],
  }).then((v) => (v === undefined ? null : v));
}

/* ---------- date picker ---------- */

export function pickDate({ title = 'Set a date', value = null, allowClear = true } = {}) {
  return dialog({
    title,
    size: 'sm',
    render: (body) => {
      body.innerHTML = `
        <input id="dlg-date" class="field field--date" type="date" value="${esc(value || '')}">
        <div class="quickdates">
          <button type="button" class="chip" data-add="0">Today</button>
          <button type="button" class="chip" data-add="1">Tomorrow</button>
          <button type="button" class="chip" data-add="7">+1 week</button>
        </div>`;
      const input = body.querySelector('#dlg-date');
      body.querySelectorAll('[data-add]').forEach((b) => {
        b.addEventListener('click', () => {
          A.play('move');
          const d = new Date();
          d.setDate(d.getDate() + Number(b.dataset.add));
          input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        });
      });
    },
    buttons: [
      ...(allowClear ? [{ label: 'Clear', value: '', cls: 'btn--ghost' }] : []),
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      { label: 'Set', cls: 'btn--gold',
        onClick: (body, close) => close(body.querySelector('#dlg-date').value || '') },
    ],
  }).then((v) => (v === undefined ? null : v));
}

/* ---------- particles & flourishes ---------- */

export function sparkle(target, { count = 12, colors = ['G', 'Y', 'W', 'T'] } = {}) {
  if (!motion() || !target) return;
  const host = fxLayer();
  const r = target.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'particle';
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 28 + Math.random() * 52;
    const size = 3 + Math.floor(Math.random() * 4);
    p.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;
      background:${PAL[colors[i % colors.length]]};
      --dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 14}px;
      animation-delay:${Math.random() * 60}ms`;
    host.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
    setTimeout(() => p.remove(), 1200);
  }
}

export function xpFloat(amount, target) {
  if (!target || !amount) return;
  const host = fxLayer();
  const r = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `xpfloat ${amount < 0 ? 'is-neg' : ''}`;
  el.textContent = `${amount > 0 ? '+' : ''}${amount} XP`;
  el.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

export function confetti({ count = 46 } = {}) {
  if (!motion()) return;
  const host = fxLayer();
  const keys = ['G', 'Y', 'R', 'T', 'B', 'W', 'M'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    const size = 4 + Math.floor(Math.random() * 6);
    p.style.cssText = `left:${Math.random() * 100}vw;width:${size}px;height:${size}px;
      background:${PAL[keys[i % keys.length]]};
      animation-delay:${Math.random() * 500}ms;
      animation-duration:${1500 + Math.random() * 1400}ms;
      --spin:${Math.random() > 0.5 ? 1 : -1}`;
    host.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}

/* ---------- level up ceremony ---------- */

export function levelUp({ level, rank, rankUp = false }) {
  A.play('levelup');
  haptic([12, 40, 12, 40, 24]);
  confetti();
  return dialog({
    variant: 'celebrate',
    size: 'sm',
    dismissable: true,
    sound: null,
    render: `<div class="levelup">
        <div class="levelup__burst">${toSVG(ICONS.star, { pixel: 5 })}</div>
        <p class="levelup__kicker">${rankUp ? 'NEW RANK' : 'LEVEL UP'}</p>
        <p class="levelup__lvl">LV ${level}</p>
        <p class="levelup__rank">${esc(rank)}</p>
        <p class="levelup__note">${rankUp
          ? `You are now a ${esc(rank)}.`
          : 'Your legend grows.'}</p>
      </div>`,
    buttons: [{ label: 'Onward!', value: true, cls: 'btn--gold', sound: 'fanfare' }],
  });
}

/* ---------- typewriter ---------- */

export function typewriter(el, text, { speed = 22, sound = false } = {}) {
  if (!el) return Promise.resolve();
  if (!motion()) { el.textContent = text; return Promise.resolve(); }
  el.textContent = '';
  el.classList.add('is-typing');
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      el.textContent = text.slice(0, ++i);
      if (sound && i % 3 === 0) A.play('type');
      if (i < text.length) setTimeout(tick, speed);
      else { el.classList.remove('is-typing'); resolve(); }
    };
    setTimeout(tick, 90);
  });
}

/* ---------- press feedback on every pixel button ---------- */

export function installPressFX() {
  const down = (e) => {
    const t = e.target.closest('.btn, .tab, .row, .card--tap, .sheet__item, .chip, .pick__opt');
    if (t) t.classList.add('is-press');
  };
  const up = () => $$('.is-press').forEach((n) => n.classList.remove('is-press'));
  document.addEventListener('pointerdown', down, { passive: true });
  document.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('pointercancel', up, { passive: true });
}

/* ---------- empty state ---------- */

export function emptyState({ icon: ic = 'skull', title = 'Nothing here', text = '', action = null }) {
  return `<div class="empty">
      <div class="empty__art">${icon(ic, 4)}</div>
      <p class="empty__title">${esc(title)}</p>
      ${text ? `<p class="empty__text">${esc(text)}</p>` : ''}
      ${action ? `<button type="button" class="btn btn--gold" data-act="${esc(action.act)}">
          ${esc(action.label)}</button>` : ''}
    </div>`;
}

/* ---------- progress bar markup ---------- */

export function xpBar(lvl, { showText = true } = {}) {
  return `<div class="xpbar" role="progressbar" aria-valuenow="${lvl.pct}"
        aria-valuemin="0" aria-valuemax="100">
      <div class="xpbar__track">
        <div class="xpbar__fill" style="width:${lvl.pct}%"></div>
      </div>
      ${showText ? `<span class="xpbar__text">${lvl.into} / ${lvl.need} XP</span>` : ''}
    </div>`;
}
