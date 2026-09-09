/* ============================================================
   GRIMOIRE - actions.js
   Flows shared by more than one view: creating things, moving
   things between chambers, the context menus, deleting.
   ============================================================ */

import * as S from './store.js';
import * as A from './audio.js';
import * as U from './ui.js';
import { icon } from './sprites.js';
import { FOLDER_ICONS, PRIORITIES } from './store.js';

/* ---------- folder tree picker ---------- */

/**
 * Indented picker over the whole chamber tree.
 * Resolves: folder id, '' for the root, or undefined if cancelled.
 */
export function pickFolder({
  title = 'Choose a chamber',
  current = null,
  exclude = null,        // folder id whose subtree cannot be chosen
  allowRoot = true,
  confirmLabel = 'Move here',
} = {}) {
  const blocked = exclude ? new Set(S.descendantIds(exclude)) : new Set();

  const rows = [];
  if (allowRoot) {
    rows.push({ id: '', name: 'The Grimoire (top level)', depth: 0, icon: 'book' });
  }
  const walk = (parentId, depth) => {
    S.childFolders(parentId).forEach((f) => {
      rows.push({ id: f.id, name: f.name, depth, icon: f.icon, blocked: blocked.has(f.id) });
      walk(f.id, depth + 1);
    });
  };
  walk(null, allowRoot ? 1 : 0);

  return U.dialog({
    title,
    size: 'lg',
    render: (body) => {
      body.innerHTML = `<div class="treepick">${rows.map((r) => `
        <button type="button" class="treepick__row ${r.id === (current || '') ? 'is-on' : ''}"
          data-id="${U.esc(r.id)}" ${r.blocked ? 'disabled' : ''}
          style="--d:${r.depth}">
          <span class="treepick__ico">${icon(r.icon || 'scroll', 2)}</span>
          <span class="treepick__name">${U.esc(r.name)}</span>
          ${r.blocked ? '<span class="treepick__lock">locked</span>' : ''}
        </button>`).join('')}</div>`;
      body.dataset.value = current || '';
      body.querySelectorAll('.treepick__row').forEach((b) => {
        b.addEventListener('click', () => {
          A.play('folder');
          body.querySelectorAll('.treepick__row').forEach((x) => x.classList.remove('is-on'));
          b.classList.add('is-on');
          body.dataset.value = b.dataset.id;
        });
      });
    },
    buttons: [
      { label: 'Cancel', value: undefined, cls: 'btn--ghost' },
      { label: confirmLabel, cls: 'btn--gold',
        onClick: (body, close) => close(body.dataset.value) },
    ],
  });
}

/* ---------- creating ---------- */

export async function newFolderFlow(parentId, api) {
  const name = await U.promptBox({
    title: 'New chamber',
    label: 'What shall it be called?',
    placeholder: 'e.g. Recipes, Work, Dreams',
    confirmLabel: 'Build it',
    maxlength: 60,
  });
  if (!name) return null;
  const f = S.createFolder({ name, parentId: parentId || null });
  A.play('chest');
  U.notify.ok(`Chamber "${f.name}" built`);
  api?.refresh();
  return f;
}

export async function newNoteFlow(folderId, api) {
  const n = S.createNote({ folderId: folderId || null, title: '', body: '' });
  A.play('open');
  api?.go(`#/note/${n.id}`);
  return n;
}

export async function newQuestFlow(folderId, api) {
  const result = await U.dialog({
    title: 'New quest',
    size: 'lg',
    render: (body) => {
      body.innerHTML = `
        <label class="field__label" for="q-title">The task</label>
        <input id="q-title" class="field" type="text" maxlength="160"
          placeholder="Slay the laundry mountain" autocapitalize="sentences">

        <label class="field__label">Difficulty</label>
        <div class="segbar" id="q-prio">
          ${PRIORITIES.map((p) => `
            <button type="button" class="seg ${p.id === 'normal' ? 'is-on' : ''}"
              data-id="${p.id}">${p.icon} ${U.esc(p.label)}
              <small>${p.xp}xp</small></button>`).join('')}
        </div>

        <label class="field__label" for="q-due">Due (optional)</label>
        <input id="q-due" class="field field--date" type="date">
        <div class="quickdates">
          <button type="button" class="chip" data-add="0">Today</button>
          <button type="button" class="chip" data-add="1">Tomorrow</button>
          <button type="button" class="chip" data-add="7">+1 week</button>
          <button type="button" class="chip" data-add="">None</button>
        </div>`;

      const prio = body.querySelector('#q-prio');
      prio.dataset.value = 'normal';
      prio.querySelectorAll('.seg').forEach((b) => {
        b.addEventListener('click', () => {
          A.play('move');
          prio.querySelectorAll('.seg').forEach((x) => x.classList.remove('is-on'));
          b.classList.add('is-on');
          prio.dataset.value = b.dataset.id;
        });
      });

      const due = body.querySelector('#q-due');
      body.querySelectorAll('[data-add]').forEach((b) => {
        b.addEventListener('click', () => {
          A.play('move');
          if (b.dataset.add === '') { due.value = ''; return; }
          due.value = S.addDays(S.todayISO(), Number(b.dataset.add));
        });
      });
    },
    buttons: [
      { label: 'Cancel', value: null, cls: 'btn--ghost' },
      { label: 'Accept quest', cls: 'btn--gold',
        onClick: (body, close) => {
          const title = body.querySelector('#q-title').value.trim();
          if (!title) {
            A.play('error');
            const f = body.querySelector('#q-title');
            f.classList.add('shake');
            setTimeout(() => f.classList.remove('shake'), 420);
            return false;
          }
          close({
            title,
            priority: body.querySelector('#q-prio').dataset.value,
            due: body.querySelector('#q-due').value || null,
          });
        } },
    ],
  });

  if (!result) return null;
  const q = S.createQuest({ folderId: folderId || null, ...result });
  A.play('select');
  U.notify.ok('Quest accepted', { icon: 'sword' });
  api?.refresh();
  return q;
}

/* ---------- completing a quest, with the full flourish ---------- */

export function toggleQuestUI(id, rowEl, api) {
  const q = S.quest(id);
  if (!q) return;
  const willComplete = !q.done;
  const payload = S.toggleQuest(id);

  if (willComplete) {
    A.play('check');
    U.haptic([10, 30, 10]);
    if (rowEl) {
      rowEl.classList.add('is-completing');
      U.sparkle(rowEl.querySelector('.check') || rowEl);
      if (payload) U.xpFloat(payload.amount, rowEl.querySelector('.check') || rowEl);
    }
    // the level-up ceremony, if any, is handled centrally in app.js
    setTimeout(() => api?.refresh(), U.motion() ? 420 : 0);
  } else {
    A.play('uncheck');
    api?.refresh();
  }
}

/* ---------- context menus ---------- */

export async function folderMenu(folderId, api) {
  const f = S.folder(folderId);
  if (!f) return;
  const c = S.folderCounts(folderId);
  const choice = await U.sheet({
    title: f.name,
    subtitle: `${c.folders} chambers · ${c.notes} scrolls · ${c.quests} quests`,
    items: [
      { id: 'open', label: 'Open chamber', icon: 'chest' },
      { id: 'note', label: 'New scroll here', icon: 'scroll' },
      { id: 'quest', label: 'New quest here', icon: 'sword' },
      { id: 'sub', label: 'New chamber inside', icon: 'tower' },
      null,
      { id: 'rename', label: 'Rename', icon: 'quill' },
      { id: 'icon', label: 'Change sigil', icon: 'star' },
      { id: 'move', label: 'Move to...', icon: 'map' },
      null,
      { id: 'delete', label: 'Destroy chamber', icon: 'skull', tone: 'danger' },
    ],
  });

  switch (choice) {
    case 'open': api?.go(`#/scrolls/${folderId}`); break;
    case 'note': await newNoteFlow(folderId, api); break;
    case 'quest': await newQuestFlow(folderId, api); break;
    case 'sub': await newFolderFlow(folderId, api); break;
    case 'rename': {
      const name = await U.promptBox({ title: 'Rename chamber', value: f.name, maxlength: 60 });
      if (name) { S.renameFolder(folderId, name); U.notify.ok('Renamed'); api?.refresh(); }
      break;
    }
    case 'icon': {
      const pick = await U.pickOne({
        title: 'Choose a sigil',
        columns: 4,
        value: f.icon,
        options: FOLDER_ICONS.map((i) => ({ id: i, label: '', icon: i })),
      });
      if (pick) { S.setFolderIcon(folderId, pick); A.play('coin'); api?.refresh(); }
      break;
    }
    case 'move': {
      const target = await pickFolder({
        title: 'Move chamber to',
        current: f.parentId,
        exclude: folderId,
        confirmLabel: 'Move here',
      });
      if (target === undefined) break;
      if (S.moveFolder(folderId, target || null)) {
        A.play('chest'); U.notify.ok('Chamber moved'); api?.refresh();
      } else U.notify.err('A chamber cannot be moved inside itself');
      break;
    }
    case 'delete': await deleteFolderFlow(folderId, api); break;
  }
}

async function deleteFolderFlow(folderId, api) {
  const f = S.folder(folderId);
  const c = S.folderCounts(folderId);
  const hasStuff = c.folders + c.notes + c.quests > 0;

  if (!hasStuff) {
    const ok = await U.confirmBox({
      title: 'Destroy chamber?',
      text: `"${f.name}" is empty. This cannot be undone.`,
      confirmLabel: 'Destroy', danger: true, icon: 'skull',
    });
    if (ok) { S.deleteFolder(folderId, 'cascade'); A.play('trash');
      U.notify.ok('Chamber destroyed'); api?.go('#/scrolls'); }
    return;
  }

  const mode = await U.sheet({
    title: `"${f.name}" is not empty`,
    subtitle: `${c.folders} chambers · ${c.notes} scrolls · ${c.quests} quests inside`,
    items: [
      { id: 'lift', label: 'Keep the contents', icon: 'key',
        sub: 'Move everything up one level, delete only this chamber' },
      { id: 'cascade', label: 'Destroy everything inside', icon: 'skull', tone: 'danger',
        sub: 'Chambers, scrolls and quests are all gone' },
    ],
  });
  if (!mode) return;

  if (mode === 'cascade') {
    const ok = await U.confirmBox({
      title: 'Truly destroy it all?',
      text: `${c.notes} scrolls and ${c.quests} quests will be lost forever.`,
      confirmLabel: 'Destroy all', danger: true, icon: 'skull',
    });
    if (!ok) return;
  }
  S.deleteFolder(folderId, mode);
  A.play('trash');
  U.notify.ok(mode === 'lift' ? 'Chamber removed, contents kept' : 'Chamber destroyed');
  api?.go('#/scrolls');
}

export async function noteMenu(noteId, api, { fromEditor = false } = {}) {
  const n = S.note(noteId);
  if (!n) return;
  const choice = await U.sheet({
    title: n.title || 'Untitled scroll',
    subtitle: `Edited ${S.relTime(n.updatedAt)}`,
    items: [
      ...(fromEditor ? [] : [{ id: 'open', label: 'Read / edit', icon: 'quill' }]),
      { id: 'pin', label: n.pinned ? 'Unpin from top' : 'Pin to top', icon: 'star' },
      { id: 'rename', label: 'Rename', icon: 'quill' },
      { id: 'move', label: 'Move to chamber...', icon: 'map' },
      { id: 'duplicate', label: 'Duplicate', icon: 'book' },
      { id: 'copy', label: 'Copy text', icon: 'scroll' },
      null,
      { id: 'trash', label: 'Send to the crypt', icon: 'skull', tone: 'danger' },
    ],
  });

  switch (choice) {
    case 'open': api?.go(`#/note/${noteId}`); break;
    case 'pin':
      S.updateNote(noteId, { pinned: !n.pinned });
      A.play('coin');
      U.notify.ok(n.pinned ? 'Unpinned' : 'Pinned to top');
      api?.refresh();
      break;
    case 'rename': {
      const t = await U.promptBox({ title: 'Rename scroll', value: n.title, maxlength: 120 });
      if (t) { S.updateNote(noteId, { title: t }); api?.refresh(); }
      break;
    }
    case 'move': {
      const target = await pickFolder({ title: 'Move scroll to', current: n.folderId });
      if (target === undefined) break;
      S.updateNote(noteId, { folderId: target || null });
      A.play('chest'); U.notify.ok('Scroll moved'); api?.refresh();
      break;
    }
    case 'duplicate': {
      const copy = S.createNote({
        folderId: n.folderId,
        title: `${n.title || 'Untitled'} (copy)`,
        body: n.body,
      });
      U.notify.ok('Scroll copied');
      api?.refresh();
      break;
    }
    case 'copy':
      await copyText(`${n.title}\n\n${n.body}`);
      break;
    case 'trash': {
      const ok = await U.confirmBox({
        title: 'To the crypt?',
        text: 'You can bring it back from Options > The crypt.',
        confirmLabel: 'Send it', danger: true, icon: 'skull',
      });
      if (ok) {
        S.trashNote(noteId);
        A.play('trash');
        U.notify.ok('Sent to the crypt');
        if (fromEditor) api?.back(); else api?.refresh();
      }
      break;
    }
  }
}

export async function questMenu(questId, api) {
  const q = S.quest(questId);
  if (!q) return;
  const p = PRIORITIES.find((x) => x.id === q.priority);
  const choice = await U.sheet({
    title: q.title,
    subtitle: `${p?.label || 'Common'}${q.due ? ` · due ${S.prettyDate(q.due)}` : ''}`,
    items: [
      { id: 'toggle', label: q.done ? 'Mark as unfinished' : 'Complete quest', icon: 'star' },
      { id: 'rename', label: 'Edit the task', icon: 'quill' },
      { id: 'prio', label: 'Change difficulty', icon: 'flame' },
      { id: 'due', label: q.due ? 'Change due date' : 'Set a due date', icon: 'clock' },
      { id: 'sub', label: 'Add a step', icon: 'key' },
      { id: 'move', label: 'Move to chamber...', icon: 'map' },
      null,
      { id: 'delete', label: 'Abandon quest', icon: 'skull', tone: 'danger' },
    ],
  });

  switch (choice) {
    case 'toggle': toggleQuestUI(questId, null, api); break;
    case 'rename': {
      const t = await U.promptBox({ title: 'Edit quest', value: q.title, maxlength: 160 });
      if (t) { S.updateQuest(questId, { title: t }); api?.refresh(); }
      break;
    }
    case 'prio': {
      const pick = await U.pickOne({
        title: 'Difficulty',
        value: q.priority,
        columns: 2,
        options: PRIORITIES.map((x) => ({ id: x.id, label: `${x.icon} ${x.label}` })),
      });
      if (pick) { S.updateQuest(questId, { priority: pick }); A.play('coin'); api?.refresh(); }
      break;
    }
    case 'due': {
      const d = await U.pickDate({ value: q.due, title: 'Due date' });
      if (d === null) break;
      S.updateQuest(questId, { due: d || null });
      api?.refresh();
      break;
    }
    case 'sub': {
      const t = await U.promptBox({ title: 'Add a step', placeholder: 'A smaller piece of it',
        confirmLabel: 'Add' });
      if (t) { S.addSubtask(questId, t); A.play('step'); api?.refresh(); }
      break;
    }
    case 'move': {
      const target = await pickFolder({ title: 'Move quest to', current: q.folderId });
      if (target === undefined) break;
      S.updateQuest(questId, { folderId: target || null });
      A.play('chest'); U.notify.ok('Quest moved'); api?.refresh();
      break;
    }
    case 'delete': {
      const ok = await U.confirmBox({
        title: 'Abandon quest?', text: q.title,
        confirmLabel: 'Abandon', danger: true, icon: 'skull',
      });
      if (ok) { S.deleteQuest(questId); A.play('trash'); U.notify.ok('Quest abandoned'); api?.refresh(); }
      break;
    }
  }
}

/* ---------- clipboard ---------- */

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    U.notify.ok('Copied');
    return true;
  } catch {
    U.notify.err('Could not copy - try selecting the text by hand');
    return false;
  }
}

/* ---------- breadcrumb markup, shared by scrolls & quests ---------- */

export function breadcrumbs(folderId, routeBase) {
  const chain = S.folderPath(folderId);
  const parts = [`<button type="button" class="crumb" data-crumb="">
      ${icon('book', 2)}<span>Grimoire</span></button>`];
  chain.forEach((f, i) => {
    const last = i === chain.length - 1;
    parts.push('<span class="crumb__sep">&gt;</span>');
    parts.push(`<button type="button" class="crumb ${last ? 'is-here' : ''}"
        data-crumb="${U.esc(f.id)}">${U.esc(f.name)}</button>`);
  });
  return `<nav class="crumbs" data-base="${routeBase}">${parts.join('')}</nav>`;
}

export function bindBreadcrumbs(root, routeBase, api) {
  U.bind(root, '[data-crumb]', (el) => {
    const id = el.dataset.crumb;
    api.go(id ? `${routeBase}/${id}` : routeBase);
  }, 'back');
}
