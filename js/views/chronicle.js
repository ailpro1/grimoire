/* ============================================================
   GRIMOIRE - views/chronicle.js
   The journal: one entry per day, with a mood and a calendar.
   ============================================================ */

import * as S from '../store.js';
import * as U from '../ui.js';
import * as Au from '../audio.js';
import * as TK from '../textkit.js';
import * as MD from '../markup.js';
import * as PH from '../photos.js';
import { icon } from '../sprites.js';

let viewMonth = S.todayISO().slice(0, 7);   // 'YYYY-MM'
let search = '';

/* ---------- month calendar ---------- */

function calendar(monthKey, api) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = first.getDay();
  const today = S.todayISO();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal__pad"></span>');
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${S.pad2(m)}-${S.pad2(d)}`;
    const e = S.journalFor(iso);
    const mood = e ? S.MOODS.find((x) => x.v === e.mood) : null;
    const future = iso > today;
    cells.push(`<button type="button"
        class="cal__day ${e ? 'has-entry' : ''} ${iso === today ? 'is-today' : ''} ${future ? 'is-future' : ''}"
        data-day="${iso}" title="${e ? (e.title || mood?.label || 'entry') : iso}">
        <span class="cal__n">${d}</span>
        ${e ? `<span class="cal__dot mood-${e.mood}"></span>` : ''}
      </button>`);
  }

  return `<section class="panel px px-cut">
      <header class="panel__head panel__head--cal">
        <button type="button" class="navbtn" data-month="-1" aria-label="Previous month">&#9666;</button>
        <h2>${S.MONTHS_LONG[m - 1]} ${y}</h2>
        <button type="button" class="navbtn" data-month="1" aria-label="Next month">&#9656;</button>
      </header>
      <div class="cal__dow">${['S','M','T','W','T','F','S']
        .map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal">${cells.join('')}</div>
    </section>`;
}

/* ---------- list view ---------- */

function listView({ api }) {
  const entries = S.journalEntries({ search });
  const monthEntries = S.journalEntries({ month: viewMonth });
  const today = S.todayISO();
  const hasToday = !!S.journalFor(today);
  const db = S.get();

  const moodCounts = S.MOODS.map((mo) => ({
    ...mo,
    n: monthEntries.filter((e) => e.mood === mo.v).length,
  }));
  const maxMood = Math.max(1, ...moodCounts.map((x) => x.n));

  const html = `
  <div class="view view--chronicle">

    <section class="todaycard px px-cut ${hasToday ? 'is-written' : ''}">
      <div class="todaycard__l">
        ${icon(hasToday ? 'book' : 'quill', 4)}
      </div>
      <div class="todaycard__r">
        <p class="todaycard__date">${U.esc(S.prettyDateLong(today))}</p>
        <p class="todaycard__msg">${hasToday
          ? 'Today is written. Add more if you like.'
          : 'Today has not been written yet.'}</p>
        <button type="button" class="btn btn--gold btn--sm" data-act="today">
          ${hasToday ? 'Continue entry' : 'Begin today'}
        </button>
      </div>
    </section>

    <div class="toolbar">
      <div class="searchbox px">
        ${icon('glass', 2)}
        <input type="search" id="ch-search" class="searchbox__in" placeholder="Search the chronicle"
          value="${U.esc(search)}" autocapitalize="none" enterkeyhint="search">
        ${search ? '<button type="button" class="searchbox__x" data-act="clear">&#10005;</button>' : ''}
      </div>
    </div>

    ${search ? '' : calendar(viewMonth, api)}

    ${!search && monthEntries.length ? `
      <section class="panel px px-cut">
        <header class="panel__head"><h2>${icon('heart', 2)} Moods this month</h2></header>
        <div class="moodbars">
          ${moodCounts.map((mo) => `
            <div class="moodbar">
              <span class="moodbar__face mood-${mo.v}">${U.esc(mo.face)}</span>
              <div class="moodbar__track">
                <div class="moodbar__fill mood-${mo.v}" style="width:${(mo.n / maxMood) * 100}%"></div>
              </div>
              <span class="moodbar__n">${mo.n}</span>
            </div>`).join('')}
        </div>
      </section>` : ''}

    ${entries.length ? `
      <div class="rows__label">${search ? `${entries.length} found` : 'All entries'}</div>
      <div class="rows">
        ${entries.slice(0, 60).map((e) => {
          const mo = S.MOODS.find((x) => x.v === e.mood);
          const preview = MD.plain(e.body).slice(0, 70);
          const pics = (e.attachments || []).length;
          return `<div class="row row--entry" data-entry="${e.date}">
              <span class="row__mood mood-${e.mood}">${U.esc(mo?.face || '._.')}</span>
              <div class="row__main" data-openday="${e.date}">
                <span class="row__title">${U.esc(e.title || S.prettyDate(e.date))}</span>
                <span class="row__meta">
                  <em>${U.esc(S.prettyDate(e.date))}</em>
                  ${pics ? `<em class="row__pics">${pics} photo${pics === 1 ? '' : 's'}</em>` : ''}
                  ${preview ? `<em class="row__preview">${U.esc(preview)}</em>` : ''}
                </span>
              </div>
              <button type="button" class="row__more" data-entrymenu="${e.date}"
                aria-label="More">&#8943;</button>
            </div>`;
        }).join('')}
      </div>` : U.emptyState({
        icon: 'quill',
        title: search ? 'Nothing found' : 'The chronicle is blank',
        text: search ? `No entry mentions "${search}".`
          : 'One entry a day. Even a single line counts.',
        action: search ? null : { act: 'today', label: 'Write today' },
      })}

    <div class="pagepad"></div>
  </div>`;

  return {
    title: 'CHRONICLE',
    tab: 'chronicle',
    fab: { label: 'Write', onTap: () => api.go(`#/chronicle/${S.todayISO()}`) },
    html,
    mount(root) {
      U.bind(root, '[data-act="today"]', () => api.go(`#/chronicle/${S.todayISO()}`), 'open');
      U.bind(root, '[data-act="clear"]', () => { search = ''; api.refresh(); }, 'back');

      const input = root.querySelector('#ch-search');
      const run = U.debounce((v) => { search = v; api.refresh({ keepScroll: true, focus: '#ch-search' }); }, 260);
      input.addEventListener('input', () => run(input.value));

      U.bind(root, '[data-month]', (el) => {
        const [y, m] = viewMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + Number(el.dataset.month), 1);
        viewMonth = `${d.getFullYear()}-${S.pad2(d.getMonth() + 1)}`;
        Au.play('move');
        api.refresh({ keepScroll: true });
      }, null);

      U.bind(root, '[data-day]', (el) => {
        const iso = el.dataset.day;
        if (iso > S.todayISO()) { U.notify.warn('That day has not happened yet'); return; }
        api.go(`#/chronicle/${iso}`);
      }, 'open');

      U.bind(root, '[data-openday]', (el) => api.go(`#/chronicle/${el.dataset.openday}`), 'open');

      U.bind(root, '[data-entrymenu]', async (el) => {
        const date = el.dataset.entrymenu;
        const e = S.journalFor(date);
        const choice = await U.sheet({
          title: e.title || S.prettyDate(date),
          subtitle: S.prettyDateLong(date),
          items: [
            { id: 'open', label: 'Read / edit', icon: 'quill' },
            { id: 'copy', label: 'Copy text', icon: 'scroll' },
            null,
            { id: 'del', label: 'Erase this entry', icon: 'skull', tone: 'danger' },
          ],
        });
        if (choice === 'open') api.go(`#/chronicle/${date}`);
        if (choice === 'copy') {
          const { copyText } = await import('../actions.js');
          copyText(`${S.prettyDateLong(date)}\n${e.title}\n\n${e.body}`);
        }
        if (choice === 'del') {
          const ok = await U.confirmBox({
            title: 'Erase the entry?', text: 'This one cannot be undone.',
            confirmLabel: 'Erase', danger: true, icon: 'skull',
          });
          if (ok) { S.deleteJournal(date); Au.play('trash'); U.notify.ok('Entry erased'); api.refresh(); }
        }
      }, 'open');
    },
  };
}

/* ---------- day editor ---------- */

function dayView({ date, api }) {
  const today = S.todayISO();
  if (date > today) date = today;
  const e = S.journalFor(date);
  const mood = e?.mood ?? 3;
  const isToday = date === today;
  const words = (e?.body || '').trim() ? e.body.trim().split(/\s+/).length : 0;

  const html = `
  <div class="view view--day">
    <div class="daynav">
      <button type="button" class="navbtn px" data-nav="-1" aria-label="Previous day">&#9666;</button>
      <div class="daynav__mid">
        <b>${U.esc(S.prettyDateLong(date))}</b>
        ${isToday ? '<em>today</em>' : `<em>${U.esc(S.relTime(S.fromYmd(date).getTime()))}</em>`}
      </div>
      <button type="button" class="navbtn px ${date >= today ? 'is-off' : ''}"
        data-nav="1" aria-label="Next day" ${date >= today ? 'disabled' : ''}>&#9656;</button>
    </div>

    <div class="moodpick px px-cut">
      <p class="moodpick__q">How went the day?</p>
      <div class="moodpick__row">
        ${S.MOODS.map((m) => `
          <button type="button" class="moodopt ${m.v === mood ? 'is-on' : ''} mood-${m.v}"
            data-mood="${m.v}">
            <span class="moodopt__face">${U.esc(m.face)}</span>
            <span class="moodopt__lbl">${U.esc(m.label)}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="editor px px-cut">
      <input id="j-title" class="editor__title" type="text" maxlength="120"
        placeholder="A title for the day (optional)" value="${U.esc(e?.title || '')}"
        autocapitalize="sentences" enterkeyhint="next">
      <div class="editor__bar">
        <button type="button" class="chip chip--mode" data-act="mode">
          ${icon('glass', 2)}<span>Read</span>
        </button>
        <span class="editor__status" id="j-status">${e ? 'saved' : 'not yet written'}</span>
      </div>

      ${TK.runebar()}

      <textarea id="j-body" class="editor__body editor__body--tall"
        placeholder="What happened? What did you notice? What will you remember?"
        autocapitalize="sentences" spellcheck="true">${U.esc(e?.body || '')}</textarea>

      <div class="md" id="j-read" hidden></div>

      ${PH.galleryShell()}

      <div class="editor__foot">
        <span id="j-count">${words} word${words === 1 ? '' : 's'}</span>
        ${e ? `<span>edited ${U.esc(S.relTime(e.updatedAt))}</span>` : '<span>+15 XP on first save</span>'}
      </div>
    </div>
    <div class="pagepad"></div>
  </div>`;

  return {
    title: isToday ? 'TODAY' : S.prettyDate(date).toUpperCase(),
    tab: 'chronicle',
    back: '#/chronicle',
    html,
    mount(root) {
      const title = root.querySelector('#j-title');
      const body = root.querySelector('#j-body');
      const status = root.querySelector('#j-status');
      const count = root.querySelector('#j-count');
      const reader = root.querySelector('#j-read');
      const runes = root.querySelector('.runebar');
      const modeChip = root.querySelector('[data-act="mode"]');
      let dirty = false;
      let reading = false;
      let curMood = mood;

      const save = U.debounce(() => {
        if (!title.value.trim() && !body.value.trim()) {
          status.textContent = 'nothing to save yet';
          dirty = false;
          return;
        }
        const existed = !!S.journalFor(date);
        S.upsertJournal(date, { title: title.value, body: body.value, mood: curMood, __silent: true });
        dirty = false;
        status.textContent = 'saved';
        status.className = 'editor__status is-ok';
        Au.play('save');
        if (!existed) {
          U.notify.ok('Entry begun  +15 XP', { icon: 'quill' });
          U.xpFloat(15, status);
        }
      }, 800);

      const onEdit = () => {
        dirty = true;
        status.textContent = 'writing...';
        status.className = 'editor__status is-busy';
        const w = body.value.trim() ? body.value.trim().split(/\s+/).length : 0;
        count.textContent = `${w} word${w === 1 ? '' : 's'}`;
        save();
      };
      title.addEventListener('input', onEdit);
      body.addEventListener('input', onEdit);
      title.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); body.focus(); }
      });

      U.bind(root, '[data-mood]', (el) => {
        curMood = Number(el.dataset.mood);
        root.querySelectorAll('.moodopt').forEach((x) => x.classList.remove('is-on'));
        el.classList.add('is-on');
        Au.play('toggle');
        U.sparkle(el, { count: 6 });
        if (S.journalFor(date) || title.value.trim() || body.value.trim()) { dirty = true; save(); }
      }, null);

      U.bind(root, '[data-nav]', (el) => {
        const next = S.addDays(date, Number(el.dataset.nav));
        if (next > today) return;
        if (dirty) save.flush();
        api.go(`#/chronicle/${next}`);
      }, 'move');

      const flush = () => { if (dirty) save.flush(); };
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', flush);
      api.onLeave(() => {
        flush();
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', flush);
      });

      /* ---- rune bar, photos and the reader ---- */

      TK.bindRunebar(root, body, {
        onPhoto: async () => {
          // an entry must exist before a picture can hang off it
          if (!S.journalFor(date)) {
            S.upsertJournal(date, { title: title.value, body: body.value, mood: curMood });
          } else {
            flush();
          }
          const added = await PH.attachFlow('journal', date);
          if (added) await PH.mountGallery(root, 'journal', date);
        },
      });
      TK.autoList(body);

      PH.mountGallery(root, 'journal', date);

      const drawReader = () => {
        reader.innerHTML = MD.render(body.value);
        reader.querySelectorAll('[data-task]').forEach((b) => {
          b.addEventListener('click', () => {
            const next = MD.toggleTask(body.value, Number(b.dataset.task));
            if (next == null) return;
            Au.play('check');
            body.value = next;
            onEdit();
            drawReader();
          });
        });
      };

      U.bind(root, '[data-act="mode"]', () => {
        reading = !reading;
        body.hidden = reading;
        runes.hidden = reading;
        reader.hidden = !reading;
        modeChip.classList.toggle('is-on', reading);
        modeChip.querySelector('span').textContent = reading ? 'Write' : 'Read';
        if (reading) { flush(); drawReader(); }
      }, 'toggle');

      if (!e) setTimeout(() => body.focus(), 340);
    },
  };
}

export default function chronicle({ params, api }) {
  return params.id ? dayView({ date: params.id, api }) : listView({ api });
}
