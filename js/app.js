/* ============================================================
   GRIMOIRE - app.js
   Boot, the splash, onboarding, routing and the app chrome.
   ============================================================ */

import * as S from './store.js';
import * as Au from './audio.js';
import * as U from './ui.js';
import * as Update from './update.js';
import { icon, avatar, tome, AVATARS, AVATAR_NAMES } from './sprites.js';

import dashboard from './views/dashboard.js';
import scrolls from './views/scrolls.js';
import editor from './views/editor.js';
import chronicle from './views/chronicle.js';
import quests from './views/quests.js';
import options, { avatarPicker } from './views/options.js';
import searchView from './views/search.js';

/* ---------- routes ---------- */

const ROUTES = [
  { re: /^#\/keep\/?$/,             view: dashboard,  name: 'keep',      depth: 0 },
  { re: /^#\/scrolls\/?$/,          view: scrolls,    name: 'scrolls',   depth: 0 },
  { re: /^#\/scrolls\/(.+)$/,       view: scrolls,    name: 'scrolls',   depth: 1 },
  { re: /^#\/note\/(.+)$/,          view: editor,     name: 'note',      depth: 2 },
  { re: /^#\/chronicle\/?$/,        view: chronicle,  name: 'chronicle', depth: 0 },
  { re: /^#\/chronicle\/(.+)$/,     view: chronicle,  name: 'chronicle', depth: 1 },
  { re: /^#\/quests\/?$/,           view: quests,     name: 'quests',    depth: 0 },
  { re: /^#\/quests\/(.+)$/,        view: quests,     name: 'quests',    depth: 1 },
  { re: /^#\/options\/?$/,          view: options,    name: 'options',   depth: 0 },
  { re: /^#\/search\/?$/,           view: searchView, name: 'search',    depth: 1 },
];

const TABS = [
  { id: 'dashboard', route: '#/keep',      label: 'Keep',      icon: 'tower' },
  { id: 'scrolls',   route: '#/scrolls',   label: 'Scrolls',   icon: 'scroll' },
  { id: 'chronicle', route: '#/chronicle', label: 'Chronicle', icon: 'quill' },
  { id: 'quests',    route: '#/quests',    label: 'Quests',    icon: 'sword' },
  { id: 'options',   route: '#/options',   label: 'Options',   icon: 'potion' },
];

function match(hash) {
  for (const r of ROUTES) {
    const m = r.re.exec(hash);
    if (m) return { ...r, params: { id: m[1] ? decodeURIComponent(m[1]) : null } };
  }
  return { ...ROUTES[0], params: { id: null } };
}

/* ---------- element handles ---------- */

const els = {};
let current = null;          // the mounted view descriptor
let leaveHooks = [];
let lastDepth = 0;
let renderToken = 0;

/* ---------- chrome ---------- */

function syncChrome() {
  const db = S.get();
  const st = db.settings;
  const root = document.documentElement;

  root.dataset.theme = st.theme || 'dungeon';
  root.classList.toggle('scanlines', !!st.scanlines);
  root.classList.toggle('crt', !!st.crt);
  U.setMotion(st.motion !== false);

  Au.configure({ sfx: st.sfx, music: st.music, volume: st.volume });

  // keep the iOS status bar tinted to match the theme
  const bg = getComputedStyle(root).getPropertyValue('--c-void').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.setAttribute('content', bg);
}

function renderTabs(activeTab) {
  els.tabbar.innerHTML = TABS.map((t) => `
    <button type="button" class="tab ${t.id === activeTab ? 'is-on' : ''}"
      data-route="${t.route}" aria-current="${t.id === activeTab ? 'page' : 'false'}">
      <span class="tab__ico">${icon(t.icon, 2)}</span>
      <span class="tab__lbl">${t.label}</span>
    </button>`).join('');
}

function renderTopbar(v) {
  els.topbar.innerHTML = `
    ${v.back
      ? `<button type="button" class="topbtn" data-back aria-label="Back">&#9666;</button>`
      : `<button type="button" class="topbtn topbtn--mark" data-route="#/keep" aria-label="Home">
           ${icon('book', 2)}</button>`}
    <h1 class="topbar__title">${U.esc(v.title || 'GRIMOIRE')}</h1>
    <div class="topbar__acts">
      ${(v.actions || []).map((a) => `
        <button type="button" class="topbtn" data-action="${a.id}"
          aria-label="${U.esc(a.aria || a.id)}">${a.label}</button>`).join('')}
      ${v.tab !== 'options' && !v.hideSearch ? `<button type="button" class="topbtn" data-route="#/search"
          aria-label="Search">${icon('glass', 2)}</button>` : ''}
    </div>`;
}

function renderFab(v) {
  if (!v.fab) { els.fab.hidden = true; els.fab.innerHTML = ''; return; }
  els.fab.hidden = false;
  els.fab.innerHTML = `<button type="button" class="fab__btn" aria-label="${U.esc(v.fab.label)}">
      <span class="fab__plus">+</span></button>`;
  els.fab.querySelector('.fab__btn').onclick = () => { Au.play('open'); v.fab.onTap(); };
}

/* ---------- the api handed to views ---------- */

const api = {
  go(hash) {
    if (location.hash === hash) { render(); return; }
    location.hash = hash;
  },
  back() {
    if (current?.back) { location.hash = current.back; return; }
    if (history.length > 1) history.back(); else location.hash = '#/keep';
  },
  refresh(opts = {}) { render({ silent: true, ...opts }); },
  onLeave(fn) { leaveHooks.push(fn); },
  syncChrome,
  pickAvatar: () => avatarPicker(api),
};

/* ---------- rendering ---------- */

async function render(opts = {}) {
  const token = ++renderToken;
  const hash = location.hash || '#/keep';
  const r = match(hash);

  const scrollY = opts.keepScroll ? els.screen.scrollTop : 0;
  const dir = r.depth > lastDepth ? 'fwd' : (r.depth < lastDepth ? 'back' : 'same');

  // let the outgoing view clean up (flush unsaved text, drop listeners)
  leaveHooks.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
  leaveHooks = [];

  const v = r.view({ params: r.params, api });
  current = v;

  const animate = U.motion() && !opts.silent && dir !== 'same';
  if (animate) {
    els.screen.classList.add(dir === 'fwd' ? 'is-out-left' : 'is-out-right');
    await new Promise((res) => setTimeout(res, 130));
    if (token !== renderToken) return;
  }

  // Each render gets its own container. Views attach delegated
  // listeners to it, so throwing it away on the next render takes
  // every listener with it - no leaks, and no view's handlers ever
  // fire for another view's markup.
  const host = document.createElement('div');
  host.className = 'screen__inner';
  host.innerHTML = v.html;
  els.screen.replaceChildren(host);

  els.screen.className = `screen ${animate ? (dir === 'fwd' ? 'is-in-right' : 'is-in-left') : ''}`;
  renderTopbar(v);
  renderTabs(v.tab);
  renderFab(v);
  document.title = `${v.title} · GRIMOIRE`;

  if (animate) {
    requestAnimationFrame(() => {
      els.screen.classList.remove('is-in-right', 'is-in-left');
    });
  }

  try { v.mount?.(host, api); } catch (e) { console.error('[view]', e); }

  els.screen.scrollTop = scrollY;
  if (opts.focus) {
    const f = els.screen.querySelector(opts.focus);
    if (f) { const p = f.value?.length ?? 0; f.focus(); f.setSelectionRange?.(p, p); }
  }
  lastDepth = r.depth;
}

/* ---------- onboarding ---------- */

function onboard() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'onboard';
    wrap.innerHTML = `
      <div class="onboard__inner">
        <div class="onboard__mark">${tome(7)}</div>
        <h1 class="onboard__h">GRIMOIRE</h1>
        <p class="onboard__p">Notes, a journal and a quest board,<br>kept on this device alone.</p>

        <label class="field__label" for="ob-name">What shall we call you?</label>
        <input id="ob-name" class="field field--big" type="text" maxlength="24"
          placeholder="Your name" autocapitalize="words" autocomplete="off" enterkeyhint="done">

        <p class="field__label">Choose a portrait</p>
        <div class="onboard__avs">
          ${Object.keys(AVATARS).map((k, i) => `
            <button type="button" class="avopt ${i === 0 ? 'is-on' : ''}" data-av="${k}">
              ${avatar(k, 3)}<span>${AVATAR_NAMES[k]}</span>
            </button>`).join('')}
        </div>

        <button type="button" class="btn btn--gold btn--wide" id="ob-go">Open the grimoire</button>
        <p class="onboard__fine">You can change all of this later in Options.</p>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('is-in'));

    let av = Object.keys(AVATARS)[0];
    wrap.querySelectorAll('[data-av]').forEach((b) => {
      b.addEventListener('click', () => {
        Au.play('select');
        wrap.querySelectorAll('.avopt').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        av = b.dataset.av;
      });
    });

    const name = wrap.querySelector('#ob-name');
    const finish = async () => {
      const v = name.value.trim();
      if (!v) {
        Au.play('error');
        name.classList.add('shake');
        setTimeout(() => name.classList.remove('shake'), 420);
        name.focus();
        return;
      }
      S.setName(v);
      S.setAvatar(av);
      Au.play('fanfare');
      U.confetti({ count: 30 });

      const wantSeed = await U.confirmBox({
        title: `Well met, ${v}`,
        text: 'Shall I fill the grimoire with a few example chambers, scrolls and quests to show how it works?',
        confirmLabel: 'Yes please', cancelLabel: 'Start empty',
      });
      if (wantSeed) S.seedStarter();

      wrap.classList.remove('is-in');
      setTimeout(() => wrap.remove(), 320);
      resolve();
    };

    wrap.querySelector('#ob-go').addEventListener('click', finish);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
    setTimeout(() => name.focus(), 420);
  });
}

/* ---------- splash ---------- */

function splash({ firstRun }) {
  return new Promise((resolve) => {
    const el = document.getElementById('boot');
    el.querySelector('#boot-mark').innerHTML = tome(8);
    let done = false;
    const finish = async (viaTap) => {
      if (done) return;
      done = true;
      if (viaTap) { await Au.unlock(); Au.play('start'); }
      el.classList.add('is-gone');
      setTimeout(() => el.remove(), 460);
      resolve();
    };
    el.addEventListener('click', () => finish(true));
    if (!firstRun) setTimeout(() => finish(false), 1500);
  });
}

/* ---------- iOS keyboard handling ----------
   On iOS the on-screen keyboard shrinks the visual viewport but not
   the layout viewport. The app is a fixed shell, so Safari's own
   "reveal the caret" scroll cannot help - it just shoves the whole
   shell upwards and the text disappears off the top. Instead:

   - the scrolling area is shortened to the space above the keyboard
     (--kb, used by .screen and the dialog layers)
   - any layout-viewport shift Safari applies is put straight back
   - the field being typed in is parked just below the top bar, and a
     tall textarea is capped to the room that is left, so it scrolls
     inside itself and the page never moves
------------------------------------------------------------------ */

function installKeyboardHandling() {
  const vv = window.visualViewport;
  const screen = document.getElementById('screen');
  const topbar = document.getElementById('topbar');
  const capped = new Set();
  let fitTimer = null;

  const isField = (el) => !!el &&
    ((/^(INPUT|TEXTAREA)$/.test(el.tagName) && el.type !== 'range' && el.type !== 'file') ||
     el.isContentEditable === true);

  function uncap() {
    capped.forEach((el) => {
      el.style.height = '';
      el.style.maxHeight = '';
      el.style.minHeight = '';
    });
    capped.clear();
  }

  function fit() {
    const el = document.activeElement;
    if (!isField(el)) { uncap(); return; }

    // undo any shift Safari applied to the layout viewport
    if (window.scrollY || document.documentElement.scrollTop) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
    }

    const inDialog = !!el.closest('.dlg, .sheet');
    const vTop = vv ? vv.offsetTop : 0;
    const vBottom = vTop + (vv ? vv.height : window.innerHeight);
    const safeTop = inDialog ? vTop + 8
      : Math.max(vTop, topbar.getBoundingClientRect().bottom) + 6;
    const safeBottom = vBottom - 10;

    let r = el.getBoundingClientRect();

    // the rune bar belongs to the field below it, so keep it on screen
    // too - the tools are no use scrolled off the top
    const bar = el.previousElementSibling?.classList?.contains('runebar')
      ? el.previousElementSibling : null;
    const topOf = () => (bar ? bar.getBoundingClientRect().top : r.top);

    // move the screen as little as possible: only when the field is
    // hidden behind the top bar or behind the keyboard
    if (!inDialog && screen) {
      let delta = 0;
      if (topOf() < safeTop) delta = topOf() - safeTop;
      else if (r.bottom > safeBottom) delta = Math.min(r.bottom - safeBottom, topOf() - safeTop);
      if (Math.abs(delta) > 2) {
        screen.scrollTop += delta;
        r = el.getBoundingClientRect();
      }
    }

    if (el.tagName === 'TEXTAREA' || el.isContentEditable) {
      // an exact height, not just a cap: the field then scrolls inside
      // itself, and the caret is kept in view by the browser
      const room = Math.round(safeBottom - r.top);
      if (room > 120) {
        el.style.minHeight = '0px';
        el.style.height = `${room}px`;
        el.style.maxHeight = `${room}px`;
        capped.add(el);
      } else {
        el.style.height = '';
        el.style.maxHeight = '';
        el.style.minHeight = '';
        capped.delete(el);
      }
    }
  }

  const scheduleFit = (delay = 60) => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fit, delay);
  };

  if (vv) {
    const onResize = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
      document.body.classList.toggle('kbd-open', kb > 80);
      if (kb <= 80) uncap();
      scheduleFit();
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
  }

  document.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    // the keyboard slides up over about a third of a second, and the
    // viewport only settles at the end of it
    scheduleFit(80);
    setTimeout(fit, 380);
    setTimeout(fit, 650);
  });

  document.addEventListener('focusout', () => {
    uncap();
    setTimeout(() => {
      if (!isField(document.activeElement)) {
        document.body.classList.remove('kbd-open');
      }
    }, 120);
  });
}

/* ---------- boot ---------- */

async function boot() {
  els.screen = document.getElementById('screen');
  els.topbar = document.getElementById('topbar');
  els.tabbar = document.getElementById('tabbar');
  els.fab = document.getElementById('fab');

  const db = S.load();
  S.refreshStreak();
  syncChrome();
  U.installPressFX();
  installKeyboardHandling();

  // one-time audio unlock on the very first touch anywhere
  const kick = () => { Au.unlock(); };
  document.addEventListener('pointerdown', kick, { once: true });
  document.addEventListener('touchstart', kick, { once: true, passive: true });

  await splash({ firstRun: db.settings.firstRun });

  if (db.settings.firstRun || !db.profile.name) await onboard();

  // global chrome handlers (delegated once)
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-route]');
    if (r) { Au.play('tab'); api.go(r.dataset.route); return; }
    const b = e.target.closest('[data-back]');
    if (b) { Au.play('back'); api.back(); return; }
    const a = e.target.closest('[data-action]');
    if (a) { Au.play('open'); current?.onAction?.(a.dataset.action); }
  });

  window.addEventListener('hashchange', () => render());

  // One place that celebrates a level-up, whatever earned it -
  // a quest, a step, a new scroll, a chronicle entry or a streak.
  let celebrating = false;
  S.onXp((payload) => {
    if (!payload.levelUp || celebrating) return;
    celebrating = true;
    // let whatever animation triggered it finish first
    setTimeout(async () => {
      await U.levelUp(payload);
      celebrating = false;
    }, 520);
  });

  // a nudge to back up, at most once a week and never on day one
  maybeNagBackup();

  // keep an installed copy current: checks now, on resume, and hourly
  Update.start();

  if (!location.hash) location.hash = '#/keep';
  render();

  // keyboard shortcuts help on desktop; harmless on iOS
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // never while something is being written or a dialog is up: the
    // editors are contenteditable, so a typed "2" is a two, not a tab
    const a = document.activeElement;
    if (a?.isContentEditable) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName || '')) return;
    if (document.body.classList.contains('is-locked')) return;
    const map = { 1: '#/keep', 2: '#/scrolls', 3: '#/chronicle', 4: '#/quests', 5: '#/options' };
    if (map[e.key]) { api.go(map[e.key]); Au.play('tab'); }
    if (e.key === '/') { e.preventDefault(); api.go('#/search'); }
  });
}

const WEEK = 7 * 86400000;

function maybeNagBackup() {
  const db = S.get();
  const st = db.settings;
  if (!st.autoBackupNag) return;

  // nothing worth losing yet
  if (db.notes.length + db.quests.length + db.journal.length < 8) return;
  // backed up recently
  if (Date.now() - (st.lastBackupAt || 0) < WEEK) return;
  // already nagged recently
  if (Date.now() - (st.lastNagAt || 0) < WEEK) return;
  // brand new grimoire - let them use it first
  if (Date.now() - (db.profile.createdAt || 0) < 2 * 86400000) return;

  S.setSetting('lastNagAt', Date.now());
  setTimeout(() => {
    U.toast('Worth saving a backup - Options > Backup', { tone: 'warn', icon: 'chest', ms: 5200 });
  }, 2600);
}

document.addEventListener('DOMContentLoaded', boot, { once: true });
