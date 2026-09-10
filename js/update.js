/* ============================================================
   GRIMOIRE - update.js
   Keeps an installed copy current. The service worker does the
   comparing (see sw.js); this side decides when to ask and when
   to simply get on with it.

   - a check runs at every launch, when the app is brought back
     to the front, when the network returns, and every 30 minutes
   - an update found at launch is applied straight away: nothing
     is on screen yet, so the reload is invisible
   - an update found mid-session asks first, because reloading
     while someone is writing would be rude
   ============================================================ */

import * as S from './store.js';
import * as U from './ui.js';

const RELOAD_FLAG = 'grimoire.updating';
const CHECK_EVERY = 30 * 60 * 1000;
const RESUME_AFTER = 10 * 60 * 1000;

const state = {
  supported: false,
  registration: null,
  build: null,
  updatedAt: 0,
  lastCheckAt: 0,
  status: 'unknown',     // unknown | current | ready | offline | unsupported
  pendingBuild: null,    // build the user has already been told about
  booting: true,
};

export function info() { return { ...state }; }

/* ---------- talking to the worker ---------- */

function ask(worker, message, timeout = 20000) {
  return new Promise((resolve) => {
    if (!worker) { resolve(null); return; }
    const ch = new MessageChannel();
    const done = (v) => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(null), timeout);
    ch.port1.onmessage = (e) => done(e.data);
    try { worker.postMessage(message, [ch.port2]); }
    catch { done(null); }
  });
}

/* ---------- applying ---------- */

let applying = false;    // the user (or the launch check) asked for the update
let reloaded = false;

function reloadOnce() {
  if (reloaded) return;
  reloaded = true;
  S.flushPending();          // belt and braces - pagehide does this too
  location.reload();
}

/** Reloads onto the new files. Editors flush their text on pagehide. */
export function applyNow() {
  if (applying) return;
  applying = true;
  try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* private mode */ }
  const waiting = state.registration?.waiting;
  if (waiting) {
    // a new worker is standing by: let it take over first, then reload
    // either on controllerchange or, if that never comes, on this timer
    waiting.postMessage('skip-waiting');
    setTimeout(reloadOnce, 1200);
  } else {
    reloadOnce();
  }
}

function alreadyReloadedThisSession() {
  try { return sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { return false; }
}

function clearReloadFlag() {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* nothing to clear */ }
}

/* ---------- telling the user ---------- */

async function offerUpdate(build) {
  if (state.pendingBuild === build) return;   // already offered this one
  state.pendingBuild = build;

  const auto = S.get().settings.autoUpdate !== false;
  if (state.booting && auto && !alreadyReloadedThisSession()) {
    U.toast('New version - reloading', { tone: 'info', icon: 'star', ms: 1200 });
    setTimeout(applyNow, 260);
    return;
  }

  const ok = await U.confirmBox({
    title: 'A new version',
    text: 'An update to the grimoire has arrived. Reloading takes a moment and keeps everything you have written.',
    confirmLabel: 'Update now',
    cancelLabel: 'Later',
    icon: 'star',
  });
  if (ok) applyNow();
  else U.notify.info('It will be applied next time you open the app');
}

/* ---------- checking ---------- */

/** Resolves the status string. `manual` reports back even when nothing changed. */
export async function check({ manual = false } = {}) {
  if (!state.supported) {
    if (manual) U.notify.warn('Updates need the offline cache - see Options > About');
    return 'unsupported';
  }
  state.lastCheckAt = Date.now();

  // a changed sw.js is the browser's business, not ours
  try { await state.registration?.update(); } catch { /* offline - fine */ }

  if (state.registration?.waiting) {
    state.status = 'ready';
    await offerUpdate(state.build || 'sw');
    return 'ready';
  }

  const worker = navigator.serviceWorker.controller;
  if (!worker) {
    // first ever load: the worker is still installing and has the
    // newest files by definition
    state.status = 'current';
    if (manual) U.notify.ok('Up to date');
    return 'current';
  }

  const res = await ask(worker, { type: 'check' });
  if (!res) { state.status = 'offline'; if (manual) U.notify.warn('Could not reach the server'); return 'offline'; }

  state.status = res.status;
  if (res.build) state.build = res.build;
  if (res.updatedAt) state.updatedAt = res.updatedAt;

  if (res.status === 'ready') await offerUpdate(res.build);
  else if (manual && res.status === 'current') U.notify.ok('Up to date');
  else if (manual && res.status === 'offline') U.notify.warn('No connection - update check skipped');

  return res.status;
}

/* ---------- boot ---------- */

export function start() {
  if (!('serviceWorker' in navigator)) {
    state.status = 'unsupported';
    return;
  }
  if (!window.isSecureContext) {
    state.status = 'unsupported';
    console.info('[grimoire] not a secure context - offline cache and updates disabled. ' +
      'Serve over https (or localhost) for both.');
    return;
  }
  state.supported = true;

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'update-ready') {
      state.status = 'ready';
      state.build = e.data.build || state.build;
      state.updatedAt = e.data.updatedAt || state.updatedAt;
      offerUpdate(state.build);
    }
  });

  // A worker that skipped waiting has taken over, so the page must
  // reload to run what it now serves. The very first install also
  // fires this when the worker claims the page - there is nothing
  // new to run then, so only reload if we asked for the switch.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) reloadOnce();
  });

  navigator.serviceWorker.register('sw.js').then(async (reg) => {
    state.registration = reg;

    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      if (!fresh) return;
      fresh.addEventListener('statechange', () => {
        // 'installed' with a controller present means an update, not a
        // first install
        if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
          state.status = 'ready';
          offerUpdate(state.build || 'sw');
        }
      });
    });

    const v = await ask(navigator.serviceWorker.controller, { type: 'version' }, 4000);
    if (v) { state.build = v.build; state.updatedAt = v.updatedAt; }

    await check();
    state.booting = false;
    clearReloadFlag();
  }).catch((e) => {
    state.supported = false;
    state.status = 'unsupported';
    console.warn('[grimoire] service worker failed', e);
  });

  // back to the front after a while, back online, or simply a long session
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - state.lastCheckAt < RESUME_AFTER) return;
    check();
  });
  window.addEventListener('online', () => check());
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, CHECK_EVERY);
}
