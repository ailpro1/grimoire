/* ============================================================
   GRIMOIRE - views/dashboard.js
   "The Keep" - the at-a-glance page.
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import * as A from '../audio.js';
import * as Act from '../actions.js';
import { icon, avatar } from '../sprites.js';

function greeting(name) {
  const h = new Date().getHours();
  const who = name || 'traveller';
  if (h < 5) return `Still awake, ${who}?`;
  if (h < 12) return `Good morrow, ${who}.`;
  if (h < 17) return `Good day, ${who}.`;
  if (h < 22) return `Good eve, ${who}.`;
  return `The candles burn low, ${who}.`;
}

function questRow(q, { showFolder = true } = {}) {
  const p = S.PRIORITIES.find((x) => x.id === q.priority) || S.PRIORITIES[1];
  const due = S.dueLabel(q.due);
  const chain = S.folderPath(q.folderId);
  const where = chain.length ? chain[chain.length - 1].name : 'Grimoire';
  const steps = q.subtasks?.length
    ? `${q.subtasks.filter((s) => s.done).length}/${q.subtasks.length} steps`
    : '';
  return `<div class="row row--quest ${q.done ? 'is-done' : ''}" data-quest="${U.esc(q.id)}">
      <button type="button" class="check ${q.done ? 'is-on' : ''}"
        data-toggle="${U.esc(q.id)}" aria-label="Complete quest">
        <span class="check__mark">&#10003;</span>
      </button>
      <div class="row__main" data-open="${U.esc(q.id)}">
        <span class="row__title">${U.esc(q.title)}</span>
        <span class="row__meta">
          <em class="prio prio--${q.priority}">${p.icon} ${U.esc(p.label)}</em>
          ${due ? `<em class="due due--${due.tone}">${due.text}</em>` : ''}
          ${steps ? `<em>${steps}</em>` : ''}
          ${showFolder ? `<em class="row__where">${U.esc(where)}</em>` : ''}
        </span>
      </div>
      <button type="button" class="row__more" data-menu="${U.esc(q.id)}" aria-label="More">&#8943;</button>
    </div>`;
}

export default function dashboard({ api }) {
  const db = S.get();
  const d = S.dashboardData();
  const name = db.profile.name || 'Wanderer';
  const maxWeek = Math.max(1, ...d.week.map((w) => w.total));
  const todo = [...d.overdue, ...d.dueToday].slice(0, 5);
  const untimed = d.open.filter((q) => !q.due).slice(0, 3);

  const html = `
  <div class="view view--dash">

    <!-- hero -->
    <section class="hero px px-cut">
      <div class="hero__top">
        <button type="button" class="hero__avatar" data-act="avatar" aria-label="Change portrait">
          ${avatar(db.profile.avatar, 4)}
        </button>
        <div class="hero__who">
          <p class="hero__greet" id="dash-greet">${U.esc(greeting(name))}</p>
          <p class="hero__rank">
            <span class="badge badge--lvl">LV ${d.lvl.level}</span>
            <span class="hero__title">${U.esc(d.lvl.rank)}</span>
          </p>
        </div>
      </div>
      ${U.xpBar(d.lvl)}
      <div class="hero__streak">
        <span class="streak ${d.week[6].total > 0 ? 'is-lit' : ''}">
          ${icon('flame', 2)}
          <b>${db.stats.streak}</b> day streak
        </span>
        <span class="streak__best">best ${db.stats.longestStreak}</span>
      </div>
    </section>

    <!-- quick actions -->
    <section class="quickrow">
      <button type="button" class="qbtn px" data-act="new-note">
        ${icon('scroll', 3)}<span>New scroll</span></button>
      <button type="button" class="qbtn px" data-act="new-quest">
        ${icon('sword', 3)}<span>New quest</span></button>
      <button type="button" class="qbtn px" data-act="today">
        ${icon('quill', 3)}<span>Today's entry</span></button>
    </section>

    <!-- stat tiles -->
    <section class="tiles">
      <button type="button" class="tile px" data-act="go-quests">
        <span class="tile__num">${d.open.length}</span>
        <span class="tile__lbl">open quests</span>
        ${d.overdue.length ? `<span class="tile__flag">${d.overdue.length} late</span>` : ''}
      </button>
      <button type="button" class="tile px" data-act="go-scrolls">
        <span class="tile__num">${d.totals.notes}</span>
        <span class="tile__lbl">scrolls</span>
      </button>
      <button type="button" class="tile px" data-act="go-chronicle">
        <span class="tile__num">${d.totals.journal}</span>
        <span class="tile__lbl">chronicle days</span>
      </button>
      <button type="button" class="tile px" data-act="go-quests">
        <span class="tile__num">${d.doneToday.length}</span>
        <span class="tile__lbl">done today</span>
      </button>
    </section>

    <!-- today -->
    <section class="panel px px-cut">
      <header class="panel__head">
        <h2>${icon('sword', 2)} Today's board</h2>
        <button type="button" class="linkbtn" data-act="go-quests">all &gt;</button>
      </header>
      ${todo.length || untimed.length ? `
        <div class="rows">
          ${todo.map((q) => questRow(q)).join('')}
          ${todo.length && untimed.length ? '<div class="rows__label">no due date</div>' : ''}
          ${untimed.map((q) => questRow(q)).join('')}
        </div>` : `
        <div class="allclear">
          ${icon('crown', 4)}
          <p>The board is clear.</p>
          <button type="button" class="btn btn--gold btn--sm" data-act="new-quest">Post a quest</button>
        </div>`}
    </section>

    <!-- chronicle nudge -->
    <section class="panel px px-cut">
      <header class="panel__head">
        <h2>${icon('quill', 2)} Chronicle</h2>
        <button type="button" class="linkbtn" data-act="go-chronicle">all &gt;</button>
      </header>
      ${d.journalToday ? `
        <button type="button" class="jtoday card--tap" data-act="today">
          <span class="jtoday__mood">${U.esc(S.MOODS.find((m) => m.v === d.journalToday.mood)?.face || '._.')}</span>
          <span class="jtoday__body">
            <b>${U.esc(d.journalToday.title || "Today's entry")}</b>
            <em>${U.esc((d.journalToday.body || '').slice(0, 80) || 'Tap to keep writing')}</em>
          </span>
        </button>` : `
        <div class="nudge">
          <p>Nothing written today.</p>
          <button type="button" class="btn btn--gold btn--sm" data-act="today">Write today's entry</button>
        </div>`}
    </section>

    <!-- week chart -->
    <section class="panel px px-cut">
      <header class="panel__head"><h2>${icon('flame', 2)} This week</h2></header>
      <div class="chart">
        ${d.week.map((w) => {
          const h = Math.round((w.total / maxWeek) * 100);
          const dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][S.fromYmd(w.iso).getDay()];
          return `<div class="chart__col ${w.isToday ? 'is-today' : ''}" title="${w.iso}: ${w.total}">
              <div class="chart__barwrap">
                <div class="chart__bar" style="height:${w.total ? Math.max(8, h) : 3}%"></div>
              </div>
              <span class="chart__lbl">${dow}</span>
            </div>`;
        }).join('')}
      </div>
      <p class="chart__cap">scrolls, entries and quests each day</p>
    </section>

    <!-- recent scrolls -->
    <section class="panel px px-cut">
      <header class="panel__head">
        <h2>${icon('scroll', 2)} Recent scrolls</h2>
        <button type="button" class="linkbtn" data-act="go-scrolls">all &gt;</button>
      </header>
      ${d.recentNotes.length ? `<div class="rows">
        ${d.recentNotes.map((n) => `
          <div class="row row--note" data-note="${U.esc(n.id)}">
            <span class="row__ico">${icon(n.pinned ? 'star' : 'scroll', 2)}</span>
            <div class="row__main" data-opennote="${U.esc(n.id)}">
              <span class="row__title">${U.esc(n.title || 'Untitled scroll')}</span>
              <span class="row__meta">
                <em>${U.esc(S.relTime(n.updatedAt))}</em>
                <em class="row__where">${U.esc(S.folderPath(n.folderId).map((f) => f.name).join(' / ') || 'Grimoire')}</em>
              </span>
            </div>
          </div>`).join('')}
      </div>` : `<div class="nudge"><p>No scrolls yet.</p>
          <button type="button" class="btn btn--gold btn--sm" data-act="new-note">Write one</button></div>`}
    </section>

    <p class="footnote">Everything is kept on this device only.
      ${db.settings.lastBackupAt
        ? `Last backup ${U.esc(S.relTime(db.settings.lastBackupAt))}.`
        : 'You have never made a backup.'}
      <button type="button" class="linkbtn" data-act="go-options">Backup now</button>
    </p>
  </div>`;

  return {
    title: 'THE KEEP',
    tab: 'dashboard',
    html,
    mount(root) {
      // greeting types itself in
      const g = root.querySelector('#dash-greet');
      if (g) U.typewriter(g, greeting(name), { speed: 26 });

      U.bind(root, '[data-act]', async (el) => {
        switch (el.dataset.act) {
          case 'new-note': Act.newNoteFlow(null, api); break;
          case 'new-quest': Act.newQuestFlow(null, api); break;
          case 'today': api.go(`#/chronicle/${S.todayISO()}`); break;
          case 'go-quests': api.go('#/quests'); break;
          case 'go-scrolls': api.go('#/scrolls'); break;
          case 'go-chronicle': api.go('#/chronicle'); break;
          case 'go-options': api.go('#/options'); break;
          case 'avatar': api.pickAvatar(); break;
        }
      });

      U.bind(root, '[data-toggle]', (el) => {
        Act.toggleQuestUI(el.dataset.toggle, el.closest('.row'), api);
      }, null);

      U.bind(root, '[data-open]', (el) => api.go('#/quests'), 'select');
      U.bind(root, '[data-menu]', (el) => Act.questMenu(el.dataset.menu, api), 'open');
      U.bind(root, '[data-opennote]', (el) => api.go(`#/note/${el.dataset.opennote}`), 'open');

      // bars grow on entry
      if (U.motion()) {
        root.querySelectorAll('.chart__bar').forEach((b, i) => {
          const h = b.style.height;
          b.style.height = '0%';
          setTimeout(() => { b.style.height = h; }, 60 + i * 45);
        });
        const fill = root.querySelector('.xpbar__fill');
        if (fill) {
          const w = fill.style.width;
          fill.style.width = '0%';
          setTimeout(() => { fill.style.width = w; }, 180);
        }
      }
    },
  };
}
