/* ============================================================
   GRIMOIRE - views/quests.js
   The quest board (to-dos). Filters, chamber scoping, steps.
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import * as Au from '../audio.js';
import * as Act from '../actions.js';
import { icon } from '../sprites.js';

const openSteps = new Set();
let filter = 'open';

const FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'Week' },
  { id: 'open',  label: 'Open' },
  { id: 'done',  label: 'Done' },
  { id: 'all',   label: 'All' },
];

function questCard(q, { showPath = true } = {}) {
  const p = S.PRIORITIES.find((x) => x.id === q.priority) || S.PRIORITIES[1];
  const due = S.dueLabel(q.due);
  const path = S.folderPath(q.folderId).map((f) => f.name).join(' / ') || 'Grimoire';
  const steps = q.subtasks || [];
  const doneSteps = steps.filter((s) => s.done).length;
  const isOpen = openSteps.has(q.id);

  return `<div class="row row--quest ${q.done ? 'is-done' : ''} prio-edge--${q.priority}"
      data-quest="${U.esc(q.id)}">
      <button type="button" class="check ${q.done ? 'is-on' : ''}"
        data-toggle="${U.esc(q.id)}" aria-label="${q.done ? 'Reopen' : 'Complete'} quest">
        <span class="check__mark">&#10003;</span>
      </button>
      <div class="row__main" data-qmenu="${U.esc(q.id)}">
        <span class="row__title">${U.esc(q.title)}</span>
        <span class="row__meta">
          <em class="prio prio--${q.priority}">${p.icon} ${U.esc(p.label)}</em>
          <em class="xptag">${p.xp} XP</em>
          ${due ? `<em class="due due--${due.tone}">${due.text}</em>` : ''}
          ${showPath ? `<em class="row__where">${U.esc(path)}</em>` : ''}
        </span>
      </div>
      ${steps.length ? `
        <button type="button" class="stepbadge ${isOpen ? 'is-open' : ''}"
          data-steps="${U.esc(q.id)}">${doneSteps}/${steps.length}</button>` : `
        <button type="button" class="row__more" data-qmenu="${U.esc(q.id)}" aria-label="More">&#8943;</button>`}
    </div>
    ${steps.length && isOpen ? `
      <div class="steps">
        ${steps.map((s) => `
          <div class="step ${s.done ? 'is-done' : ''}">
            <button type="button" class="check check--sm ${s.done ? 'is-on' : ''}"
              data-substep="${U.esc(q.id)}:${U.esc(s.id)}" aria-label="Toggle step">
              <span class="check__mark">&#10003;</span>
            </button>
            <span class="step__title">${U.esc(s.title)}</span>
            <button type="button" class="step__x" data-delstep="${U.esc(q.id)}:${U.esc(s.id)}"
              aria-label="Remove step">&#10005;</button>
          </div>`).join('')}
        <button type="button" class="step__add" data-addstep="${U.esc(q.id)}">+ add a step</button>
      </div>` : ''}`;
}

export default function quests({ params, api }) {
  const folderId = params.id || null;
  const here = S.folder(folderId);
  const scope = folderId ? new Set(S.descendantIds(folderId)) : null;

  const all = S.quests({ filter: 'all' })
    .filter((q) => !scope || scope.has(q.folderId));
  const list = S.quests({ filter })
    .filter((q) => !scope || scope.has(q.folderId));

  const total = all.length;
  const done = all.filter((q) => q.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdue = all.filter((q) => !q.done && q.due && q.due < S.todayISO()).length;

  const counts = {
    today: S.quests({ filter: 'today' }).filter((q) => !scope || scope.has(q.folderId)).length,
    week: S.quests({ filter: 'week' }).filter((q) => !scope || scope.has(q.folderId)).length,
    open: total - done,
    done,
    all: total,
  };

  let body;
  if (!list.length) {
    const msg = {
      today: 'Nothing is due today. Rest, or post a new quest.',
      week: 'Nothing due in the next seven days.',
      open: 'Every quest is complete. The realm is at peace.',
      done: 'No quests completed yet.',
      all: 'The board is empty.',
    }[filter];
    body = U.emptyState({
      icon: filter === 'open' ? 'crown' : 'sword',
      title: filter === 'open' && total ? 'All quests done!' : 'Nothing here',
      text: msg,
      action: { act: 'new-quest', label: 'Post a quest' },
    });
  } else if (folderId || filter === 'done') {
    body = `<div class="rows">${list.map((q) => questCard(q, { showPath: !folderId })).join('')}</div>`;
  } else {
    // group by chamber so a long board stays readable
    const groups = new Map();
    list.forEach((q) => {
      const key = S.folderPath(q.folderId).map((f) => f.name).join(' / ') || 'Grimoire';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(q);
    });
    body = [...groups.entries()].map(([name, qs]) => `
      <div class="rows__label">${icon('chest', 2)} ${U.esc(name)}
        <span class="rows__count">${qs.length}</span></div>
      <div class="rows">${qs.map((q) => questCard(q, { showPath: false })).join('')}</div>`).join('');
  }

  const html = `
  <div class="view view--quests">

    <section class="qsum px px-cut">
      <div class="qsum__top">
        <span class="qsum__big">${done}<i>/${total}</i></span>
        <div class="qsum__txt">
          <b>${here ? U.esc(here.name) : 'All chambers'}</b>
          <em>${overdue ? `${overdue} overdue` : (counts.open ? `${counts.open} still open` : 'all clear')}</em>
        </div>
        ${here ? '<button type="button" class="linkbtn" data-act="unscope">clear &#10005;</button>'
          : '<button type="button" class="linkbtn" data-act="scope">chamber &gt;</button>'}
      </div>
      <div class="xpbar">
        <div class="xpbar__track"><div class="xpbar__fill" style="width:${pct}%"></div></div>
        <span class="xpbar__text">${pct}% complete</span>
      </div>
    </section>

    <div class="quickadd px">
      ${icon('quill', 2)}
      <input type="text" id="q-quick" class="quickadd__in" maxlength="160"
        placeholder="Quick quest..." autocapitalize="sentences" enterkeyhint="done">
      <button type="button" class="quickadd__go" data-act="quickadd" aria-label="Add">+</button>
    </div>

    <div class="segbar segbar--scroll">
      ${FILTERS.map((f) => `
        <button type="button" class="seg ${f.id === filter ? 'is-on' : ''}" data-filter="${f.id}">
          ${f.label}<small>${counts[f.id]}</small>
        </button>`).join('')}
    </div>

    ${here ? Act.breadcrumbs(folderId, '#/quests') : ''}

    ${body}
    <div class="pagepad"></div>
  </div>`;

  return {
    title: here ? `${here.name.toUpperCase()}` : 'QUEST BOARD',
    tab: 'quests',
    back: here ? '#/quests' : null,
    fab: { label: 'Add', onTap: () => Act.newQuestFlow(folderId, api) },
    html,
    mount(root) {
      U.bind(root, '[data-filter]', (el) => {
        filter = el.dataset.filter;
        Au.play('tab');
        api.refresh({ keepScroll: true });
      }, null);

      U.bind(root, '[data-toggle]', (el) => {
        Act.toggleQuestUI(el.dataset.toggle, el.closest('.row'), api);
      }, null);

      U.bind(root, '[data-qmenu]', (el) => Act.questMenu(el.dataset.qmenu, api), 'open');

      U.bind(root, '[data-steps]', (el) => {
        const id = el.dataset.steps;
        if (openSteps.has(id)) { openSteps.delete(id); Au.play('close'); }
        else { openSteps.add(id); Au.play('folder'); }
        api.refresh({ keepScroll: true });
      }, null);

      U.bind(root, '[data-substep]', (el) => {
        const [qid, sid] = el.dataset.substep.split(':');
        const payload = S.toggleSubtask(qid, sid);
        const s = S.quest(qid)?.subtasks.find((x) => x.id === sid);
        if (s?.done) {
          Au.play('step');
          U.sparkle(el, { count: 6 });
          if (payload) U.xpFloat(payload.amount, el);
        } else Au.play('uncheck');
        setTimeout(() => api.refresh({ keepScroll: true }), 240);
      }, null);

      U.bind(root, '[data-delstep]', async (el) => {
        const [qid, sid] = el.dataset.delstep.split(':');
        S.deleteSubtask(qid, sid);
        Au.play('trash');
        api.refresh({ keepScroll: true });
      }, null);

      U.bind(root, '[data-addstep]', async (el) => {
        const t = await U.promptBox({ title: 'Add a step', confirmLabel: 'Add',
          placeholder: 'A smaller piece of it' });
        if (t) { S.addSubtask(el.dataset.addstep, t); Au.play('step');
          api.refresh({ keepScroll: true }); }
      }, 'open');

      U.bind(root, '[data-act="new-quest"]', () => Act.newQuestFlow(folderId, api));

      U.bind(root, '[data-act="scope"]', async () => {
        const target = await Act.pickFolder({ title: 'Show quests from', allowRoot: false,
          confirmLabel: 'Show these' });
        if (target) api.go(`#/quests/${target}`);
      }, 'open');
      U.bind(root, '[data-act="unscope"]', () => api.go('#/quests'), 'back');

      const quick = root.querySelector('#q-quick');
      const add = () => {
        const t = quick.value.trim();
        if (!t) { Au.play('error'); quick.classList.add('shake');
          setTimeout(() => quick.classList.remove('shake'), 400); return; }
        S.createQuest({ folderId, title: t, priority: 'normal' });
        Au.play('select');
        quick.value = '';
        U.notify.ok('Quest posted', { icon: 'sword' });
        api.refresh({ keepScroll: true, focus: '#q-quick' });
      };
      quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      U.bind(root, '[data-act="quickadd"]', add, null);

      Act.bindBreadcrumbs(root, '#/quests', api);

      if (U.motion()) {
        const fill = root.querySelector('.xpbar__fill');
        if (fill) { const w = fill.style.width; fill.style.width = '0%';
          setTimeout(() => { fill.style.width = w; }, 140); }
      }
    },
  };
}
