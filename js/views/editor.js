/* ============================================================
   GRIMOIRE - views/editor.js
   The scroll editor. Saves itself as you type.
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import * as A from '../actions.js';
import * as Au from '../audio.js';
import { icon } from '../sprites.js';

export default function editor({ params, api }) {
  const n = S.note(params.id);

  if (!n) {
    return {
      title: 'LOST SCROLL',
      back: '#/scrolls',
      html: `<div class="view">${U.emptyState({
        icon: 'skull', title: 'This scroll is gone',
        text: 'It may have been sent to the crypt.',
        action: { act: 'back', label: 'Back to the shelves' },
      })}</div>`,
      mount(root) { U.bind(root, '[data-act="back"]', () => api.go('#/scrolls')); },
    };
  }

  const path = S.folderPath(n.folderId).map((f) => f.name).join(' / ') || 'Grimoire';
  const words = (n.body || '').trim() ? (n.body || '').trim().split(/\s+/).length : 0;

  const html = `
  <div class="view view--editor">
    <div class="editor px px-cut">
      <input id="ed-title" class="editor__title" type="text" maxlength="120"
        placeholder="Name this scroll" value="${U.esc(n.title)}"
        autocapitalize="sentences" autocomplete="off" enterkeyhint="next">

      <div class="editor__bar">
        <button type="button" class="chip chip--path" data-act="move">
          ${icon('chest', 2)}<span>${U.esc(path)}</span>
        </button>
        <button type="button" class="chip ${n.pinned ? 'is-on' : ''}" data-act="pin">
          ${icon('star', 2)}<span>${n.pinned ? 'Pinned' : 'Pin'}</span>
        </button>
        <span class="editor__status" id="ed-status">saved</span>
      </div>

      <textarea id="ed-body" class="editor__body" placeholder="Write it down..."
        autocapitalize="sentences" spellcheck="true">${U.esc(n.body)}</textarea>

      <div class="editor__foot">
        <span id="ed-count">${words} word${words === 1 ? '' : 's'}</span>
        <span>${U.esc(S.relTime(n.updatedAt))}</span>
      </div>
    </div>
    <div class="pagepad"></div>
  </div>`;

  return {
    title: 'SCROLL',
    tab: 'scrolls',
    back: n.folderId ? `#/scrolls/${n.folderId}` : '#/scrolls',
    actions: [{ id: 'menu', label: '&#8943;', aria: 'Scroll options' }],
    onAction(id) {
      if (id === 'menu') A.noteMenu(n.id, api, { fromEditor: true });
    },
    html,
    mount(root) {
      const title = root.querySelector('#ed-title');
      const body = root.querySelector('#ed-body');
      const status = root.querySelector('#ed-status');
      const count = root.querySelector('#ed-count');
      let dirty = false;

      const flash = (text, cls = '') => {
        status.textContent = text;
        status.className = `editor__status ${cls}`;
      };

      const save = U.debounce(() => {
        S.updateNote(n.id, { title: title.value, body: body.value, __silent: true });
        dirty = false;
        flash('saved', 'is-ok');
        Au.play('save');
      }, 700);

      const onEdit = () => {
        dirty = true;
        flash('writing...', 'is-busy');
        const w = body.value.trim() ? body.value.trim().split(/\s+/).length : 0;
        count.textContent = `${w} word${w === 1 ? '' : 's'}`;
        save();
      };

      title.addEventListener('input', onEdit);
      body.addEventListener('input', onEdit);

      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); body.focus(); }
      });

      // Never lose a keystroke: flush on leaving, hiding or closing.
      const flush = () => { if (dirty) save.flush(); };
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', flush);
      api.onLeave(() => {
        flush();
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', flush);
      });

      U.bind(root, '[data-act="move"]', async () => {
        const target = await A.pickFolder({ title: 'Move scroll to', current: n.folderId });
        if (target === undefined) return;
        S.updateNote(n.id, { folderId: target || null });
        U.notify.ok('Scroll moved');
        api.refresh();
      }, 'open');

      U.bind(root, '[data-act="pin"]', () => {
        S.updateNote(n.id, { pinned: !n.pinned });
        Au.play('coin');
        api.refresh();
      }, null);

      // A brand-new, untouched scroll gets the cursor straight away.
      if (!n.title && !n.body) setTimeout(() => title.focus(), 320);
    },
  };
}
