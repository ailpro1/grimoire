/* ============================================================
   GRIMOIRE - views/scrolls.js
   The notes browser. Two ways to move through nested chambers:
   BROWSE (tap in, breadcrumbs out) and TREE (expand in place).
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import * as A from '../audio.js';
import * as Act from '../actions.js';
import * as MD from '../markup.js';
import { icon } from '../sprites.js';

const expanded = new Set();   // folder ids open in tree mode
let query = '';

function noteRow(n, { showPath = false } = {}) {
  const path = S.folderPath(n.folderId).map((f) => f.name).join(' / ') || 'Grimoire';
  const preview = MD.plain(n.body).slice(0, 68);
  const pics = (n.attachments || []).length;
  return `<div class="row row--note" data-note="${U.esc(n.id)}">
      <span class="row__ico">${icon(n.pinned ? 'star' : 'scroll', 2)}</span>
      <div class="row__main" data-opennote="${U.esc(n.id)}">
        <span class="row__title">${U.esc(n.title || 'Untitled scroll')}</span>
        <span class="row__meta">
          <em>${U.esc(S.relTime(n.updatedAt))}</em>
          ${pics ? `<em class="row__pics">${pics} photo${pics === 1 ? '' : 's'}</em>` : ''}
          ${preview ? `<em class="row__preview">${U.esc(preview)}</em>` : ''}
          ${showPath ? `<em class="row__where">${U.esc(path)}</em>` : ''}
        </span>
      </div>
      <button type="button" class="row__more" data-notemenu="${U.esc(n.id)}" aria-label="More">&#8943;</button>
    </div>`;
}

function folderRow(f, { depth = 0, tree = false } = {}) {
  const c = S.folderCounts(f.id);
  const kids = S.childFolders(f.id);
  // a chamber is expandable if it holds sub-chambers OR scrolls of its own
  const expandable = kids.length > 0 || S.notes({ folderId: f.id }).length > 0;
  const isOpen = expanded.has(f.id);
  const bits = [];
  if (c.folders) bits.push(`${c.folders} chamber${c.folders > 1 ? 's' : ''}`);
  if (c.notes) bits.push(`${c.notes} scroll${c.notes > 1 ? 's' : ''}`);
  if (c.openQuests) bits.push(`${c.openQuests} open quest${c.openQuests > 1 ? 's' : ''}`);

  return `<div class="row row--folder ${isOpen ? 'is-open' : ''}"
      data-folder="${U.esc(f.id)}" style="--d:${depth}">
      ${tree && expandable
        ? `<button type="button" class="twist ${isOpen ? 'is-open' : ''}"
             data-twist="${U.esc(f.id)}" aria-label="Expand">&#9656;</button>`
        : `<span class="twist twist--blank"></span>`}
      <span class="row__ico">${icon(f.icon || 'scroll', 2)}</span>
      <div class="row__main" data-openfolder="${U.esc(f.id)}">
        <span class="row__title">${U.esc(f.name)}</span>
        <span class="row__meta"><em>${bits.length ? bits.join(' · ') : 'empty'}</em></span>
      </div>
      <button type="button" class="row__more" data-foldermenu="${U.esc(f.id)}" aria-label="More">&#8943;</button>
    </div>`;
}

/** Tree mode: recursive chambers with their scrolls nested inside. */
function treeBlock(parentId, depth) {
  return S.childFolders(parentId).map((f) => {
    const open = expanded.has(f.id);
    const inner = open ? `
      <div class="tree__kids">
        ${treeBlock(f.id, depth + 1)}
        ${S.notes({ folderId: f.id }).map((n) => `
          <div class="tree__leaf" style="--d:${depth + 1}">${noteRow(n)}</div>`).join('')}
      </div>` : '';
    return folderRow(f, { depth, tree: true }) + inner;
  }).join('');
}

export default function scrolls({ params, api }) {
  const db = S.get();
  const folderId = params.id || null;
  const here = S.folder(folderId);
  const mode = db.settings.scrollsMode || 'browse';
  const searching = query.trim().length >= 2;

  const subfolders = S.childFolders(folderId);
  const localNotes = S.notes({ folderId });
  const hits = searching ? S.notes({ search: query }) : [];

  let body;
  if (searching) {
    body = hits.length
      ? `<div class="rows">${hits.map((n) => noteRow(n, { showPath: true })).join('')}</div>`
      : U.emptyState({ icon: 'glass', title: 'Nothing found',
          text: `No scroll mentions "${query.trim()}".` });
  } else if (mode === 'tree') {
    const rootNotes = S.notes({ folderId: null });
    const t = treeBlock(null, 0);
    body = (t || rootNotes.length)
      ? `<div class="tree">${t}
          ${rootNotes.map((n) => `<div class="tree__leaf" style="--d:0">${noteRow(n)}</div>`).join('')}
        </div>`
      : U.emptyState({ icon: 'chest', title: 'The grimoire is bare',
          text: 'Build a chamber, then fill it with scrolls.',
          action: { act: 'new-folder', label: 'Build a chamber' } });
  } else {
    const parts = [];
    if (subfolders.length) {
      parts.push(`<div class="rows__label">Chambers</div>
        <div class="rows">${subfolders.map((f) => folderRow(f)).join('')}</div>`);
    }
    if (localNotes.length) {
      parts.push(`<div class="rows__label">Scrolls${here ? ` in ${U.esc(here.name)}` : ''}</div>
        <div class="rows">${localNotes.map((n) => noteRow(n)).join('')}</div>`);
    }
    body = parts.length ? parts.join('') : U.emptyState({
      icon: here ? 'scroll' : 'chest',
      title: here ? `"${here.name}" is empty` : 'The grimoire is bare',
      text: here
        ? 'Add a scroll, or a chamber inside this one.'
        : 'Chambers hold scrolls. Chambers can hold chambers, as deep as you like.',
      action: { act: 'new-note', label: 'Write a scroll' },
    });
  }

  const html = `
  <div class="view view--scrolls">
    <div class="toolbar">
      <div class="searchbox px">
        ${icon('glass', 2)}
        <input type="search" id="scroll-search" class="searchbox__in" placeholder="Search all scrolls"
          value="${U.esc(query)}" autocapitalize="none" autocomplete="off" enterkeyhint="search">
        ${query ? '<button type="button" class="searchbox__x" data-act="clear">&#10005;</button>' : ''}
      </div>
      <button type="button" class="iconbtn px" data-act="mode"
        aria-label="Switch view" title="Switch view">
        ${icon(mode === 'tree' ? 'tower' : 'chest', 2)}
      </button>
    </div>

    ${searching ? `<p class="searchnote">${hits.length} result${hits.length === 1 ? '' : 's'}
        for "${U.esc(query.trim())}"</p>`
      : (mode === 'browse' ? Act.breadcrumbs(folderId, '#/scrolls')
        : '<p class="searchnote">Full tree - tap a chamber to expand it</p>')}

    ${body}

    <div class="pagepad"></div>
  </div>`;

  return {
    title: here ? here.name.toUpperCase() : 'SCROLLS',
    tab: 'scrolls',
    back: here ? (here.parentId ? `#/scrolls/${here.parentId}` : '#/scrolls') : null,
    fab: {
      label: 'Add',
      onTap: async () => {
        const choice = await U.sheet({
          title: here ? `Add to "${here.name}"` : 'Add to the grimoire',
          items: [
            { id: 'note', label: 'New scroll', icon: 'scroll', sub: 'A note you can write in' },
            { id: 'folder', label: 'New chamber', icon: 'chest', sub: 'A folder for scrolls and quests' },
            { id: 'quest', label: 'New quest', icon: 'sword', sub: 'A task with XP attached' },
          ],
        });
        if (choice === 'note') Act.newNoteFlow(folderId, api);
        if (choice === 'folder') Act.newFolderFlow(folderId, api);
        if (choice === 'quest') Act.newQuestFlow(folderId, api);
      },
    },
    html,
    mount(root) {
      const input = root.querySelector('#scroll-search');
      const run = U.debounce((v) => { query = v; api.refresh({ keepScroll: true, focus: '#scroll-search' }); }, 260);
      input.addEventListener('input', () => run(input.value));
      input.addEventListener('search', () => { query = input.value; api.refresh({ focus: '#scroll-search' }); });

      U.bind(root, '[data-act="clear"]', () => { query = ''; api.refresh(); }, 'back');
      U.bind(root, '[data-act="mode"]', () => {
        S.setSetting('scrollsMode', mode === 'tree' ? 'browse' : 'tree');
        A.play('folder');
        U.notify.info(mode === 'tree' ? 'Browsing chamber by chamber' : 'Showing the full tree');
        api.refresh();
      }, null);

      U.bind(root, '[data-act="new-note"]', () => Act.newNoteFlow(folderId, api));
      U.bind(root, '[data-act="new-folder"]', () => Act.newFolderFlow(folderId, api));

      U.bind(root, '[data-twist]', (el) => {
        const id = el.dataset.twist;
        if (expanded.has(id)) { expanded.delete(id); A.play('close'); }
        else { expanded.add(id); A.play('folder'); }
        api.refresh({ keepScroll: true });
      }, null);

      U.bind(root, '[data-openfolder]', (el) => {
        const id = el.dataset.openfolder;
        if (mode === 'tree') {
          if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
          A.play('folder');
          api.refresh({ keepScroll: true });
        } else {
          api.go(`#/scrolls/${id}`);
        }
      }, 'folder');

      U.bind(root, '[data-opennote]', (el) => api.go(`#/note/${el.dataset.opennote}`), 'open');
      U.bind(root, '[data-notemenu]', (el) => Act.noteMenu(el.dataset.notemenu, api), 'open');
      U.bind(root, '[data-foldermenu]', (el) => Act.folderMenu(el.dataset.foldermenu, api), 'open');

      Act.bindBreadcrumbs(root, '#/scrolls', api);
    },
  };
}

export function resetSearch() { query = ''; }
