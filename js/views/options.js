/* ============================================================
   GRIMOIRE - views/options.js
   Name, portrait, sound, look, backup, the crypt, about.
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import * as Au from '../audio.js';
import * as Act from '../actions.js';
import { icon, avatar, AVATARS, AVATAR_NAMES } from '../sprites.js';

export const THEMES = [
  { id: 'dungeon',   label: 'Dungeon',   swatch: ['#241a33', '#f0b429', '#43c9b0'] },
  { id: 'forest',    label: 'Deep Wood', swatch: ['#16281c', '#8ed081', '#f0b429'] },
  { id: 'castle',    label: 'Stonekeep', swatch: ['#1e2634', '#7fd6f7', '#e8e2d0'] },
  { id: 'ember',     label: 'Emberforge',swatch: ['#2a1414', '#ff8a3d', '#ffd166'] },
  { id: 'parchment', label: 'Parchment', swatch: ['#e8dcbf', '#7a4a24', '#9c2b26'] },
  { id: 'void',      label: 'The Void',  swatch: ['#0b0b10', '#c9a0ff', '#5ce1e6'] },
];

/* ---------- backup helpers ---------- */

function backupFile() {
  const json = S.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  return { json, blob, name: S.backupFilename() };
}

async function shareBackup() {
  const { blob, name, json } = backupFile();
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Grimoire backup' });
      S.markBackedUp();
      Au.play('chest');
      U.notify.ok('Backup shared');
      return true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return false;   // user cancelled - not an error
  }
  return downloadBackup();
}

function downloadBackup() {
  const { blob, name } = backupFile();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  S.markBackedUp();
  Au.play('chest');
  U.notify.ok('Backup saved');
  return true;
}

async function importFlow(api) {
  const how = await U.sheet({
    title: 'Restore a backup',
    subtitle: 'From a .json file you saved before',
    items: [
      { id: 'file', label: 'Choose a file', icon: 'chest', sub: 'Files, iCloud Drive, Downloads' },
      { id: 'paste', label: 'Paste the text', icon: 'scroll', sub: 'If picking a file is awkward' },
    ],
  });
  if (!how) return;

  let parsed = null;

  if (how === 'file') {
    const text = await pickFileText();
    if (text == null) return;
    try { parsed = JSON.parse(text); }
    catch { U.notify.err('That file is not valid JSON'); return; }
  } else {
    const text = await U.promptBox({
      title: 'Paste backup text', multiline: true, confirmLabel: 'Read it',
      placeholder: '{ "app": "GRIMOIRE", ... }',
    });
    if (!text) return;
    try { parsed = JSON.parse(text); }
    catch { U.notify.err('That text is not valid JSON'); return; }
  }

  const check = S.inspectBackup(parsed);
  if (!check.ok) { U.notify.err(check.error || 'Unreadable backup'); return; }
  const sm = check.summary;

  const mode = await U.sheet({
    title: 'Backup looks good',
    subtitle: `${sm.name} · ${sm.notes} scrolls · ${sm.quests} quests · ${sm.journal} entries`,
    items: [
      { id: 'merge', label: 'Merge into this grimoire', icon: 'key',
        sub: 'Keeps what you have, adds what is missing' },
      { id: 'replace', label: 'Replace everything', icon: 'skull', tone: 'danger',
        sub: 'Wipes this device and restores the backup exactly' },
    ],
  });
  if (!mode) return;

  if (mode === 'replace') {
    const ok = await U.confirmBox({
      title: 'Replace everything?',
      text: 'Your current scrolls, quests and entries will be overwritten. A safety snapshot is kept.',
      confirmLabel: 'Replace', danger: true, icon: 'skull',
    });
    if (!ok) return;
    S.restoreReplace(check.data);
    Au.play('fanfare');
    U.notify.ok('Grimoire restored');
  } else {
    S.restoreMerge(check.data);
    Au.play('fanfare');
    U.notify.ok('Backup merged in');
  }
  api.syncChrome();
  api.refresh();
}

function pickFileText() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json,text/plain';
    inp.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(inp);
    let settled = false;
    inp.addEventListener('change', () => {
      const f = inp.files?.[0];
      inp.remove();
      settled = true;
      if (!f) return resolve(null);
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => { U.notify.err('Could not read that file'); resolve(null); };
      fr.readAsText(f);
    });
    // If the picker is dismissed there is no reliable event on iOS,
    // so fall back to resolving on the next focus.
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!settled) { inp.remove(); resolve(null); } }, 600);
    }, { once: true });
    inp.click();
  });
}

/* ---------- the crypt ---------- */

async function cryptFlow(api) {
  const dead = S.trashedNotes();
  await U.dialog({
    title: 'The crypt',
    subtitle: dead.length ? `${dead.length} scroll${dead.length === 1 ? '' : 's'} resting here`
      : 'Empty',
    size: 'lg',
    render: (body, close) => {
      const draw = () => {
        const list = S.trashedNotes();
        body.innerHTML = list.length ? `
          <div class="rows">${list.map((n) => `
            <div class="row row--note">
              <span class="row__ico">${icon('skull', 2)}</span>
              <div class="row__main">
                <span class="row__title">${U.esc(n.title || 'Untitled scroll')}</span>
                <span class="row__meta"><em>buried ${U.esc(S.relTime(n.trashedAt))}</em></span>
              </div>
              <button type="button" class="btn btn--sm btn--ghost" data-revive="${U.esc(n.id)}">Revive</button>
              <button type="button" class="btn btn--sm btn--danger" data-burn="${U.esc(n.id)}">&#10005;</button>
            </div>`).join('')}</div>
          <button type="button" class="btn btn--danger btn--wide" data-emptyall>Empty the crypt</button>`
          : `<p class="dlg-note">Nothing is buried here. Scrolls you send to the crypt
             can be revived from this page.</p>`;

        body.querySelectorAll('[data-revive]').forEach((b) => b.addEventListener('click', () => {
          S.restoreNote(b.dataset.revive); Au.play('coin'); U.notify.ok('Scroll revived'); draw(); api.refresh();
        }));
        body.querySelectorAll('[data-burn]').forEach((b) => b.addEventListener('click', async () => {
          const ok = await U.confirmBox({ title: 'Destroy forever?',
            text: 'This scroll cannot be recovered.', confirmLabel: 'Destroy', danger: true });
          if (ok) { S.destroyNote(b.dataset.burn); Au.play('trash'); draw(); api.refresh(); }
        }));
        body.querySelector('[data-emptyall]')?.addEventListener('click', async () => {
          const ok = await U.confirmBox({ title: 'Empty the crypt?',
            text: `${S.trashedNotes().length} scrolls will be gone forever.`,
            confirmLabel: 'Empty it', danger: true, icon: 'skull' });
          if (ok) { S.emptyTrash(); Au.play('trash'); U.notify.ok('The crypt is empty'); draw(); api.refresh(); }
        });
      };
      draw();
    },
    buttons: [{ label: 'Close', value: true, cls: 'btn--ghost' }],
  });
}

/* ---------- avatar picker (also used from the dashboard) ---------- */

export async function avatarPicker(api) {
  const db = S.get();
  const pick = await U.pickOne({
    title: 'Choose your portrait',
    columns: 3,
    value: db.profile.avatar,
    options: Object.keys(AVATARS).map((k) => ({
      id: k, label: AVATAR_NAMES[k], svg: avatar(k, 3),
    })),
  });
  if (pick) {
    S.setAvatar(pick);
    Au.play('coin');
    U.notify.ok(`You are the ${AVATAR_NAMES[pick]}`);
    api.syncChrome();
    api.refresh();
  }
}

/* ---------- the view ---------- */

export default function options({ api }) {
  const db = S.get();
  const st = db.settings;
  const lvl = S.levelFor(db.profile.xp);
  const bytes = S.storageBytes();
  const snaps = S.snapshots();
  const dead = S.trashedNotes().length;
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  const row = (act, ic, label, value = '', tone = '') => `
    <button type="button" class="orow ${tone}" data-act="${act}">
      <span class="orow__ico">${icon(ic, 2)}</span>
      <span class="orow__label">${label}</span>
      <span class="orow__val">${value}</span>
      <span class="orow__chev">&#9656;</span>
    </button>`;

  const toggle = (key, ic, label, sub = '') => `
    <button type="button" class="orow orow--toggle" data-flag="${key}">
      <span class="orow__ico">${icon(ic, 2)}</span>
      <span class="orow__label">${label}${sub ? `<em>${sub}</em>` : ''}</span>
      <span class="switch ${st[key] ? 'is-on' : ''}"><i></i></span>
    </button>`;

  const html = `
  <div class="view view--options">

    <section class="profcard px px-cut">
      <button type="button" class="profcard__av" data-act="avatar">${avatar(db.profile.avatar, 5)}</button>
      <div class="profcard__body">
        <button type="button" class="profcard__name" data-act="name">
          ${U.esc(db.profile.name || 'Wanderer')} <i>&#9998;</i>
        </button>
        <p class="profcard__rank">
          <span class="badge badge--lvl">LV ${lvl.level}</span> ${U.esc(lvl.rank)}
        </p>
        ${U.xpBar(lvl)}
        <p class="profcard__stats">
          ${db.stats.questsCompleted} quests · ${db.stats.notesWritten} scrolls ·
          ${db.stats.journalDays} entries · best streak ${db.stats.longestStreak}
        </p>
      </div>
    </section>

    <section class="panel px px-cut">
      <header class="panel__head"><h2>${icon('heart', 2)} Sound</h2></header>
      <div class="orows">
        ${toggle('sfx', 'coin', 'Sound effects', 'clicks, coins, fanfares')}
        ${toggle('music', 'flame', 'Background music', 'a slow dungeon loop')}
        <div class="orow orow--slider">
          <span class="orow__ico">${icon('potion', 2)}</span>
          <span class="orow__label">Volume</span>
          <input type="range" id="vol" class="slider" min="0" max="100" step="5"
            value="${Math.round(st.volume * 100)}">
        </div>
        ${!Au.isUnlocked() ? `<p class="orow__note">
          iOS keeps sound locked until you tap the screen once. Tap
          <b>Test sound</b> to wake it.</p>` : ''}
        <button type="button" class="btn btn--ghost btn--wide" data-act="testsound">Test sound</button>
      </div>
    </section>

    <section class="panel px px-cut">
      <header class="panel__head"><h2>${icon('star', 2)} Look</h2></header>
      <div class="themegrid">
        ${THEMES.map((t) => `
          <button type="button" class="themeopt ${t.id === st.theme ? 'is-on' : ''}"
            data-theme="${t.id}">
            <span class="themeopt__sw">
              ${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}
            </span>
            <span>${t.label}</span>
          </button>`).join('')}
      </div>
      <div class="orows">
        ${toggle('scanlines', 'tower', 'CRT scanlines', 'that old screen feel')}
        ${toggle('crt', 'potion', 'Screen glow', 'vignette and colour bleed')}
        ${toggle('motion', 'sword', 'Animations', 'turn off for a calmer, faster app')}
      </div>
    </section>

    <section class="panel px px-cut">
      <header class="panel__head"><h2>${icon('chest', 2)} Backup</h2></header>
      <p class="panel__note">
        Your grimoire lives in this device's browser storage only. Nothing is uploaded
        anywhere. If you clear Safari's data or delete the app, it is gone - so save a
        backup file somewhere safe now and then.
      </p>
      <p class="backupstate ${st.lastBackupAt ? '' : 'is-warn'}">
        ${st.lastBackupAt
          ? `Last backup ${U.esc(S.relTime(st.lastBackupAt))}`
          : 'You have never backed up'}
      </p>
      <div class="orows">
        ${row('backup', 'chest', 'Save a backup', 'export .json')}
        ${row('restore', 'key', 'Restore a backup', 'merge or replace')}
        ${row('copyjson', 'scroll', 'Copy backup text', S.fmtBytes(bytes))}
        ${snaps.length ? row('snaps', 'clock', 'Safety snapshots', `${snaps.length} kept`) : ''}
      </div>
    </section>

    <section class="panel px px-cut">
      <header class="panel__head"><h2>${icon('skull', 2)} Housekeeping</h2></header>
      <div class="orows">
        ${row('crypt', 'skull', 'The crypt', dead ? `${dead} scroll${dead === 1 ? '' : 's'}` : 'empty')}
        ${row('seed', 'book', 'Add the sample content', 'chambers, scrolls, quests')}
        ${row('storage', 'coin', 'Storage used', S.fmtBytes(bytes))}
        ${row('wipe', 'flame', 'Erase everything', 'start over', 'is-danger')}
      </div>
    </section>

    <section class="panel px px-cut">
      <header class="panel__head"><h2>${icon('book', 2)} About</h2></header>
      <div class="about">
        <div class="about__mark">${icon('book', 4)}</div>
        <p><b>GRIMOIRE</b> v1.0</p>
        <p class="about__sub">A notes, journal and quest keeper for one person and one device.</p>
        <p class="about__meta">
          ${standalone ? 'Running as an installed app.' : 'Running in the browser.'}
          ${'serviceWorker' in navigator && navigator.serviceWorker.controller
            ? ' Offline cache active.' : ' Offline cache not active.'}
        </p>
        <button type="button" class="btn btn--ghost btn--wide" data-act="install">
          How to install on iPhone
        </button>
      </div>
    </section>

    <div class="pagepad"></div>
  </div>`;

  return {
    title: 'OPTIONS',
    tab: 'options',
    html,
    mount(root) {
      /* toggles */
      U.bind(root, '[data-flag]', (el) => {
        const k = el.dataset.flag;
        const v = !st[k];
        S.setSetting(k, v);
        el.querySelector('.switch')?.classList.toggle('is-on', v);
        if (k === 'sfx') Au.configure({ sfx: v });
        if (k === 'music') { Au.configure({ music: v }); if (v) Au.unlock(); }
        if (k === 'motion') U.setMotion(v);
        if (k === 'scanlines' || k === 'crt') api.syncChrome();
        Au.play('toggle');
      }, null);

      /* volume */
      const vol = root.querySelector('#vol');
      vol?.addEventListener('input', () => {
        Au.configure({ volume: Number(vol.value) / 100 });
      });
      vol?.addEventListener('change', () => {
        S.setSetting('volume', Number(vol.value) / 100);
        Au.play('coin');
      });

      /* themes */
      U.bind(root, '[data-theme]', (el) => {
        const id = el.dataset.theme;
        S.setSetting('theme', id);
        api.syncChrome();
        root.querySelectorAll('.themeopt').forEach((x) => x.classList.remove('is-on'));
        el.classList.add('is-on');
        Au.play('coin');
        U.notify.ok(`${THEMES.find((t) => t.id === id).label} it is`);
      }, null);

      /* everything else */
      U.bind(root, '[data-act]', async (el) => {
        switch (el.dataset.act) {
          case 'name': {
            const n = await U.promptBox({
              title: 'What is your name?',
              label: 'Shown on the dashboard',
              value: db.profile.name, maxlength: 24, confirmLabel: 'Save',
            });
            if (n) { S.setName(n); Au.play('fanfare'); U.notify.ok(`Well met, ${n}`);
              api.syncChrome(); api.refresh(); }
            break;
          }
          case 'avatar': avatarPicker(api); break;

          case 'testsound':
            await Au.unlock();
            Au.play('fanfare');
            U.notify.ok(Au.isUnlocked() ? 'Sound is awake' : 'Sound is still asleep - tap again');
            break;

          case 'backup': {
            const choice = await U.sheet({
              title: 'Save a backup',
              subtitle: 'A single .json file with everything in it',
              items: [
                ...(navigator.canShare
                  ? [{ id: 'share', label: 'Share / Save to Files', icon: 'chest',
                       sub: 'Best on iPhone - pick "Save to Files"' }] : []),
                { id: 'download', label: 'Download the file', icon: 'key' },
                { id: 'copy', label: 'Copy the text instead', icon: 'scroll' },
              ],
            });
            if (choice === 'share') await shareBackup();
            if (choice === 'download') downloadBackup();
            if (choice === 'copy') { await Act.copyText(S.exportJSON()); S.markBackedUp(); }
            api.refresh();
            break;
          }
          case 'restore': await importFlow(api); break;
          case 'copyjson': await Act.copyText(S.exportJSON()); S.markBackedUp(); api.refresh(); break;

          case 'snaps': {
            const list = S.snapshots();
            const pick = await U.sheet({
              title: 'Safety snapshots',
              subtitle: 'Taken automatically before restores and wipes',
              items: list.map((s) => ({
                id: String(s.i), label: s.label,
                sub: `${S.relTime(s.at)} · ${S.fmtBytes(s.bytes)}`, icon: 'clock',
              })),
            });
            if (pick == null) break;
            const ok = await U.confirmBox({
              title: 'Roll back to this snapshot?',
              text: 'Your current data will be replaced by it.',
              confirmLabel: 'Roll back', danger: true,
            });
            if (ok && S.restoreSnapshot(Number(pick))) {
              Au.play('fanfare'); U.notify.ok('Rolled back'); api.syncChrome(); api.refresh();
            }
            break;
          }

          case 'crypt': await cryptFlow(api); break;

          case 'seed': {
            const ok = await U.confirmBox({
              title: 'Add sample content?',
              text: 'A few chambers, scrolls and quests to show how it all fits together. Your own things stay put.',
              confirmLabel: 'Add it',
            });
            if (ok) { S.seedStarter(); Au.play('chest'); U.notify.ok('Sample content added'); api.refresh(); }
            break;
          }

          case 'storage':
            U.dialog({
              title: 'Storage', size: 'sm',
              render: `<p class="dlg-note">
                Using <b>${S.fmtBytes(bytes)}</b> of this browser's local storage.
                The usual limit is around 5 MB, which is tens of thousands of
                scrolls - but iOS can clear it if the device runs very low on space,
                or if you clear Safari's website data. That is what backups are for.</p>`,
              buttons: [{ label: 'Got it', value: true, cls: 'btn--gold' }],
            });
            break;

          case 'wipe': {
            const one = await U.confirmBox({
              title: 'Erase everything?',
              text: 'Every scroll, quest and entry on this device. A safety snapshot is kept.',
              confirmLabel: 'Continue', danger: true, icon: 'skull',
            });
            if (!one) break;
            const word = await U.promptBox({
              title: 'Type ERASE to confirm', label: 'This really cannot be undone',
              confirmLabel: 'Erase it all',
            });
            if ((word || '').trim().toUpperCase() !== 'ERASE') {
              U.notify.info('Nothing was erased');
              break;
            }
            S.wipeEverything();
            Au.play('trash');
            U.notify.ok('The grimoire is blank');
            api.syncChrome();
            api.go('#/keep');
            break;
          }

          case 'install':
            U.dialog({
              title: 'Install on iPhone', size: 'lg',
              render: `<ol class="steps-list">
                  <li>Open this page in <b>Safari</b> (not Chrome - only Safari can install).</li>
                  <li>Tap the <b>Share</b> button at the bottom of the screen.</li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Name it and tap <b>Add</b>.</li>
                </ol>
                <p class="dlg-note">It then opens full screen with no browser bars,
                keeps its own storage, and works without the computer running
                <em>if</em> it was served over https. Over a plain
                http:// address on your home network, the page needs the computer
                switched on each time.</p>`,
              buttons: [{ label: 'Close', value: true, cls: 'btn--gold' }],
            });
            break;
        }
      });
    },
  };
}
