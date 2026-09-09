/* ============================================================
   GRIMOIRE - views/search.js
   One field across scrolls, quests, entries and chambers.
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import { icon } from '../sprites.js';

let term = '';

const TYPE_META = {
  note:    { icon: 'scroll', label: 'Scroll' },
  quest:   { icon: 'sword',  label: 'Quest' },
  journal: { icon: 'quill',  label: 'Entry' },
  folder:  { icon: 'chest',  label: 'Chamber' },
};

export default function search({ api }) {
  const hits = S.searchAll(term);
  const groups = ['note', 'quest', 'journal', 'folder']
    .map((t) => ({ t, items: hits.filter((h) => h.type === t) }))
    .filter((g) => g.items.length);

  const html = `
  <div class="view view--search">
    <div class="toolbar">
      <div class="searchbox px searchbox--big">
        ${icon('glass', 2)}
        <input type="search" id="g-search" class="searchbox__in"
          placeholder="Search everything" value="${U.esc(term)}"
          autocapitalize="none" autocomplete="off" enterkeyhint="search">
        ${term ? '<button type="button" class="searchbox__x" data-act="clear">&#10005;</button>' : ''}
      </div>
    </div>

    ${term.trim().length < 2
      ? U.emptyState({ icon: 'glass', title: 'What are you looking for?',
          text: 'Type at least two letters. Scrolls, quests, chronicle entries and chambers are all searched.' })
      : (hits.length
        ? groups.map((g) => `
            <div class="rows__label">${icon(TYPE_META[g.t].icon, 2)}
              ${TYPE_META[g.t].label}s <span class="rows__count">${g.items.length}</span></div>
            <div class="rows">
              ${g.items.map((h) => `
                <div class="row row--hit" data-go="${h.type}:${U.esc(h.id)}">
                  <span class="row__ico">${icon(TYPE_META[h.type].icon, 2)}</span>
                  <div class="row__main">
                    <span class="row__title">${U.esc(h.title)}</span>
                    <span class="row__meta"><em class="row__preview">${U.esc(h.sub || '')}</em></span>
                  </div>
                  <span class="row__chev">&#9656;</span>
                </div>`).join('')}
            </div>`).join('')
        : U.emptyState({ icon: 'skull', title: 'Nothing found',
            text: `No trace of "${term.trim()}" anywhere in the grimoire.` }))}

    <div class="pagepad"></div>
  </div>`;

  return {
    title: 'SEARCH',
    tab: null,
    hideSearch: true,
    back: '#/keep',
    html,
    mount(root) {
      const input = root.querySelector('#g-search');
      const run = U.debounce((v) => {
        term = v;
        api.refresh({ keepScroll: true, focus: '#g-search' });
      }, 280);
      input.addEventListener('input', () => run(input.value));
      if (!term) setTimeout(() => input.focus(), 300);

      U.bind(root, '[data-act="clear"]', () => { term = ''; api.refresh({ focus: '#g-search' }); }, 'back');

      U.bind(root, '[data-go]', (el) => {
        const [type, id] = el.dataset.go.split(':');
        if (type === 'note') api.go(`#/note/${id}`);
        if (type === 'journal') api.go(`#/chronicle/${id}`);
        if (type === 'folder') api.go(`#/scrolls/${id}`);
        if (type === 'quest') {
          const q = S.quest(id);
          api.go(q?.folderId ? `#/quests/${q.folderId}` : '#/quests');
        }
      }, 'open');
    },
  };
}
