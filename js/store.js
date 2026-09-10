/* ============================================================
   GRIMOIRE - store.js
   All persistence, the folder tree, XP / levels / streaks.
   Everything lives in localStorage. No server, no accounts.
   ============================================================ */

const KEY = 'grimoire.db.v2';
const SNAP_KEY = 'grimoire.snapshots.v1';
const LEGACY_KEYS = ['grimoire.db.v1'];
export const DB_VERSION = 3;

/* ---------- small utils ---------- */

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const pad2 = (n) => String(n).padStart(2, '0');

export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const todayISO = () => ymd();

export function addDays(isoOrDate, n) {
  const d = isoOrDate instanceof Date ? new Date(isoOrDate) : fromYmd(isoOrDate);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function daysBetween(aIso, bIso) {
  const a = fromYmd(aIso), b = fromYmd(bIso);
  return Math.round((b - a) / 86400000);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const MONTHS_LONG = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

export function prettyDate(iso) {
  if (!iso) return '';
  const d = fromYmd(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function prettyDateLong(iso) {
  const d = fromYmd(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd === 1) return 'yesterday';
  if (dd < 30) return `${dd}d ago`;
  return prettyDate(ymd(new Date(ts)));
}

export function dueLabel(iso) {
  if (!iso) return null;
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return { text: 'TODAY', tone: 'now' };
  if (n === 1) return { text: 'TOMORROW', tone: 'soon' };
  if (n === -1) return { text: '1 DAY LATE', tone: 'late' };
  if (n < 0) return { text: `${-n} DAYS LATE`, tone: 'late' };
  if (n <= 7) return { text: `IN ${n} DAYS`, tone: 'soon' };
  return { text: prettyDate(iso).toUpperCase(), tone: 'far' };
}

/* ---------- levels & ranks ---------- */

export const RANKS = [
  'Peasant','Squire','Scribe','Apprentice','Journeyman','Adept','Scholar',
  'Knight','Sage','Enchanter','Loremaster','Archivist','Court Wizard',
  'High Chronicler','Grandmaster','Legend',
];

export function levelFor(xp) {
  let level = 1, need = 120, base = 0;
  while (xp >= base + need && level < 99) {
    base += need;
    level++;
    need = Math.round(need * 1.28 / 10) * 10;
  }
  return {
    level,
    into: xp - base,
    need,
    pct: Math.max(0, Math.min(100, Math.round(((xp - base) / need) * 100))),
    rank: RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2))],
  };
}

export const XP = {
  quest: { low: 5, normal: 10, high: 20, epic: 40 },
  note: 4,
  journal: 15,
  subtask: 2,
  streakBonus: 5,
};

export const PRIORITIES = [
  { id: 'low',    label: 'Trivial', icon: '·',  xp: 5  },
  { id: 'normal', label: 'Common',  icon: '◆',  xp: 10 },
  { id: 'high',   label: 'Urgent',  icon: '▲',  xp: 20 },
  { id: 'epic',   label: 'Epic',    icon: '★',  xp: 40 },
];

export const MOODS = [
  { v: 1, label: 'Cursed',   face: 'x_x' },
  { v: 2, label: 'Weary',    face: '-_-' },
  { v: 3, label: 'Steady',   face: '._.' },
  { v: 4, label: 'Cheerful', face: '^_^' },
  { v: 5, label: 'Blessed',  face: '*o*' },
];

export const FOLDER_ICONS = ['scroll','chest','tower','sword','shield','potion',
  'crown','map','key','skull','star','coin'];

/* ---------- default database ---------- */

function defaultDB() {
  const now = Date.now();
  return {
    version: DB_VERSION,
    profile: { name: '', avatar: 'knight', xp: 0, createdAt: now },
    settings: {
      sfx: true, music: false, volume: 0.55, theme: 'dungeon',
      crt: true, scanlines: true, motion: true, autoBackupNag: true,
      autoUpdate: true,
      firstRun: true, lastBackupAt: 0, startTab: 'dashboard',
    },
    folders: [],
    notes: [],
    journal: [],
    quests: [],
    stats: {
      streak: 0, longestStreak: 0, lastActiveDate: '',
      questsCompleted: 0, notesWritten: 0, journalDays: 0,
      history: {}, // iso -> {q:n, n:n, j:n}
    },
  };
}

/* ---------- load / save ---------- */

let db = null;
let saveTimer = null;
let savePending = false;
let unloading = false;
const listeners = new Set();

/* Nothing waits for a timer once the page is leaving or being hidden -
   an iOS app switch, a tab close, or a reload for an update. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { unloading = true; flushPending(); });
  window.addEventListener('pageshow', () => { unloading = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending();
  });
}

function migrate(raw) {
  const base = defaultDB();
  const out = {
    ...base,
    ...raw,
    profile: { ...base.profile, ...(raw.profile || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    stats: { ...base.stats, ...(raw.stats || {}) },
    folders: Array.isArray(raw.folders) ? raw.folders : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    journal: Array.isArray(raw.journal) ? raw.journal : [],
    quests: Array.isArray(raw.quests) ? raw.quests : [],
  };
  out.stats.history = out.stats.history || {};
  // v1 -> v2: quests gained subtasks[]
  out.quests.forEach((q) => { if (!Array.isArray(q.subtasks)) q.subtasks = []; });
  // v2 -> v3: scrolls and chronicle entries gained photo attachments
  out.notes.forEach((n) => { if (!Array.isArray(n.attachments)) n.attachments = []; });
  out.journal.forEach((e) => { if (!Array.isArray(e.attachments)) e.attachments = []; });
  out.version = DB_VERSION;
  return out;
}

export function load() {
  let raw = null;
  try {
    let txt = localStorage.getItem(KEY);
    if (!txt) {
      for (const k of LEGACY_KEYS) {
        const t = localStorage.getItem(k);
        if (t) { txt = t; break; }
      }
    }
    if (txt) raw = JSON.parse(txt);
  } catch (e) {
    console.warn('[grimoire] could not read save data', e);
  }
  db = raw ? migrate(raw) : defaultDB();
  return db;
}

export function get() {
  if (!db) load();
  return db;
}

export function saveNow() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    savePending = false;
    return true;
  } catch (e) {
    console.error('[grimoire] save failed', e);
    return false;
  }
}

/** Debounced save + notify subscribers. */
export function commit(opts = {}) {
  clearTimeout(saveTimer);
  savePending = true;
  // While the page is going away there is no later: write now, or the
  // last keystrokes are gone. Views flush their text on pagehide too,
  // and their handlers run after the one installed below.
  if (unloading || opts.immediate) { saveNow(); }
  else saveTimer = setTimeout(saveNow, 220);
  if (opts.silent !== true) listeners.forEach((fn) => fn(db));
}

/** Writes any pending save right now. */
export function flushPending() {
  if (!savePending) return false;
  clearTimeout(saveTimer);
  return saveNow();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function storageBytes() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('grimoire.')) total += k.length + (localStorage.getItem(k) || '').length;
    }
    return total * 2; // UTF-16
  } catch { return 0; }
}

export function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

/* ---------- activity, streaks, xp ---------- */

const xpHooks = new Set();
/** Listen for xp awards: fn({amount, reason, levelUp, level}) */
export function onXp(fn) { xpHooks.add(fn); return () => xpHooks.delete(fn); }

export function awardXp(amount, reason = '') {
  if (!amount) return null;
  const before = levelFor(db.profile.xp);
  db.profile.xp = Math.max(0, db.profile.xp + amount);
  const after = levelFor(db.profile.xp);
  const payload = {
    amount, reason,
    levelUp: after.level > before.level,
    rankUp: after.rank !== before.rank,
    level: after.level,
    rank: after.rank,
  };
  xpHooks.forEach((fn) => fn(payload));
  return payload;
}

/** Marks today as active, maintaining the streak. Returns true on a new day. */
export function touchActivity(kind) {
  const t = todayISO();
  const s = db.stats;
  s.history[t] = s.history[t] || { q: 0, n: 0, j: 0 };
  if (kind && s.history[t][kind] != null) s.history[t][kind]++;

  if (s.lastActiveDate === t) return false;
  const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, t) : 999;
  s.streak = gap === 1 ? s.streak + 1 : 1;
  s.lastActiveDate = t;
  s.longestStreak = Math.max(s.longestStreak || 0, s.streak);
  if (s.streak > 1) awardXp(XP.streakBonus, `${s.streak}-day streak`);
  return true;
}

/** Recomputes the streak on boot so it decays when the app sits unused. */
export function refreshStreak() {
  const s = db.stats;
  if (!s.lastActiveDate) return;
  const gap = daysBetween(s.lastActiveDate, todayISO());
  if (gap > 1) s.streak = 0;
}

/* ---------- folders (the nested tree) ---------- */

export function folders() { return db.folders; }

export function folder(id) {
  return id ? db.folders.find((f) => f.id === id) || null : null;
}

export function childFolders(parentId = null) {
  return db.folders
    .filter((f) => (f.parentId || null) === (parentId || null))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export function createFolder({ name, parentId = null, icon = 'scroll' }) {
  const f = {
    id: uid(),
    name: (name || 'New Chamber').trim().slice(0, 60),
    parentId: parentId || null,
    icon,
    order: db.folders.filter((x) => (x.parentId || null) === (parentId || null)).length,
    createdAt: Date.now(),
  };
  db.folders.push(f);
  commit();
  return f;
}

export function renameFolder(id, name) {
  const f = folder(id);
  if (!f) return;
  f.name = (name || f.name).trim().slice(0, 60);
  commit();
}

export function setFolderIcon(id, icon) {
  const f = folder(id);
  if (!f) return;
  f.icon = icon;
  commit();
}

/** Every folder id beneath `id`, inclusive. */
export function descendantIds(id, out = []) {
  out.push(id);
  childFolders(id).forEach((c) => descendantIds(c.id, out));
  return out;
}

/** Root -> leaf chain of folder objects. */
export function folderPath(id) {
  const chain = [];
  let cur = folder(id);
  let guard = 0;
  while (cur && guard++ < 64) {
    chain.unshift(cur);
    cur = folder(cur.parentId);
  }
  return chain;
}

export function folderDepth(id) { return folderPath(id).length; }

export function canMoveFolder(id, targetId) {
  if (!id) return false;
  if (id === targetId) return false;
  return !descendantIds(id).includes(targetId);
}

export function moveFolder(id, targetId) {
  if (!canMoveFolder(id, targetId)) return false;
  const f = folder(id);
  if (!f) return false;
  f.parentId = targetId || null;
  f.order = childFolders(targetId).length;
  commit();
  return true;
}

/**
 * mode 'cascade' deletes the subtree and everything filed in it.
 * mode 'lift' moves children and items up to this folder's parent.
 */
export function deleteFolder(id, mode = 'cascade') {
  const f = folder(id);
  if (!f) return;
  if (mode === 'lift') {
    const up = f.parentId || null;
    db.folders.forEach((c) => { if (c.parentId === id) c.parentId = up; });
    db.notes.forEach((n) => { if (n.folderId === id) n.folderId = up; });
    db.quests.forEach((q) => { if (q.folderId === id) q.folderId = up; });
    db.folders = db.folders.filter((x) => x.id !== id);
  } else {
    const kill = new Set(descendantIds(id));
    db.folders = db.folders.filter((x) => !kill.has(x.id));
    db.notes = db.notes.filter((n) => !kill.has(n.folderId));
    db.quests = db.quests.filter((q) => !kill.has(q.folderId));
  }
  commit();
  sweepMedia();
}

export function folderCounts(id) {
  const deep = new Set(descendantIds(id));
  const notes = db.notes.filter((n) => deep.has(n.folderId) && !n.trashed).length;
  const quests = db.quests.filter((q) => deep.has(q.folderId));
  return {
    notes,
    quests: quests.length,
    openQuests: quests.filter((q) => !q.done).length,
    folders: childFolders(id).length,
  };
}

/* ---------- notes ---------- */

export function notes({ folderId = undefined, search = '', includeTrashed = false } = {}) {
  let list = db.notes.filter((n) => includeTrashed || !n.trashed);
  if (folderId !== undefined) list = list.filter((n) => (n.folderId || null) === (folderId || null));
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((n) =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q) ||
      (n.tags || []).some((t) => t.toLowerCase().includes(q)));
  }
  return list.sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function note(id) { return db.notes.find((n) => n.id === id) || null; }

export function createNote({ folderId = null, title = '', body = '' } = {}) {
  const n = {
    id: uid(), folderId: folderId || null,
    title: title.slice(0, 120), body,
    tags: [], pinned: false, trashed: false, attachments: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.notes.unshift(n);
  db.stats.notesWritten = (db.stats.notesWritten || 0) + 1;
  touchActivity('n');
  awardXp(XP.note, 'new scroll');
  commit();
  return n;
}

export function updateNote(id, patch) {
  const n = note(id);
  if (!n) return null;
  Object.assign(n, patch, { updatedAt: Date.now() });
  commit({ silent: patch.__silent === true });
  return n;
}

export function trashNote(id) {
  const n = note(id);
  if (!n) return;
  n.trashed = true;
  n.trashedAt = Date.now();
  commit();
}

export function restoreNote(id) {
  const n = note(id);
  if (!n) return;
  n.trashed = false;
  delete n.trashedAt;
  commit();
}

export function destroyNote(id) {
  db.notes = db.notes.filter((n) => n.id !== id);
  commit();
  sweepMedia();
}

export function emptyTrash() {
  db.notes = db.notes.filter((n) => !n.trashed);
  commit();
  sweepMedia();
}

export function trashedNotes() {
  return db.notes.filter((n) => n.trashed)
    .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
}

/* ---------- photo attachments ----------
   The pictures themselves live in IndexedDB (see media.js);
   the grimoire only keeps a small record of what is attached
   to what, so localStorage stays tiny.
------------------------------------------------------------ */

function holder(kind, id) {
  return kind === 'journal' ? journalFor(id) : note(id);
}

export function attachmentsOf(kind, id) {
  const rec = holder(kind, id);
  return rec && Array.isArray(rec.attachments) ? rec.attachments : [];
}

export function addAttachment(kind, id, meta) {
  const rec = holder(kind, id);
  if (!rec) return null;
  if (!Array.isArray(rec.attachments)) rec.attachments = [];
  rec.attachments.push(meta);
  rec.updatedAt = Date.now();
  commit();
  return meta;
}

export function removeAttachment(kind, id, mediaId) {
  const rec = holder(kind, id);
  if (!rec) return;
  rec.attachments = (rec.attachments || []).filter((a) => a.id !== mediaId);
  rec.updatedAt = Date.now();
  commit();
  sweepMedia();
}

/** Every media id the grimoire still points at. */
export function usedMediaIds() {
  const ids = new Set();
  db.notes.forEach((n) => (n.attachments || []).forEach((a) => ids.add(a.id)));
  db.journal.forEach((e) => (e.attachments || []).forEach((a) => ids.add(a.id)));
  return ids;
}

/** Drops orphaned pictures. Fire and forget - never blocks a save. */
export function sweepMedia() {
  import('./media.js')
    .then((m) => m.gc(usedMediaIds()))
    .catch(() => { /* no IndexedDB - nothing to sweep */ });
}

/* ---------- quests (to-dos) ---------- */

export function quests({ folderId = undefined, filter = 'all', search = '' } = {}) {
  let list = db.quests.slice();
  if (folderId !== undefined) list = list.filter((q) => (q.folderId || null) === (folderId || null));
  const t = todayISO();
  if (filter === 'open') list = list.filter((q) => !q.done);
  if (filter === 'done') list = list.filter((q) => q.done);
  if (filter === 'today') list = list.filter((q) => !q.done && q.due && q.due <= t);
  if (filter === 'week') list = list.filter((q) => !q.done && q.due && q.due <= addDays(t, 7));
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((q) => (q.title || '').toLowerCase().includes(s) ||
      (q.notes || '').toLowerCase().includes(s));
  }
  const rank = { epic: 0, high: 1, normal: 2, low: 3 };
  return list.sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    if (a.done) return (b.completedAt || 0) - (a.completedAt || 0);
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) || (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function quest(id) { return db.quests.find((q) => q.id === id) || null; }

export function createQuest({ folderId = null, title, priority = 'normal', due = null, notes = '' }) {
  const q = {
    id: uid(), folderId: folderId || null,
    title: (title || 'Untitled quest').trim().slice(0, 160),
    notes, priority, due: due || null,
    done: false, subtasks: [],
    createdAt: Date.now(), completedAt: null,
  };
  db.quests.unshift(q);
  commit();
  return q;
}

export function updateQuest(id, patch) {
  const q = quest(id);
  if (!q) return null;
  Object.assign(q, patch);
  commit();
  return q;
}

/** Returns the xp payload when a quest is completed, else null. */
export function toggleQuest(id) {
  const q = quest(id);
  if (!q) return null;
  q.done = !q.done;
  let payload = null;
  if (q.done) {
    q.completedAt = Date.now();
    db.stats.questsCompleted = (db.stats.questsCompleted || 0) + 1;
    touchActivity('q');
    payload = awardXp(XP.quest[q.priority] ?? 10, 'quest complete');
  } else {
    q.completedAt = null;
    db.stats.questsCompleted = Math.max(0, (db.stats.questsCompleted || 0) - 1);
    awardXp(-(XP.quest[q.priority] ?? 10), 'quest reopened');
  }
  commit();
  return payload;
}

export function deleteQuest(id) {
  db.quests = db.quests.filter((q) => q.id !== id);
  commit();
}

export function addSubtask(questId, title) {
  const q = quest(questId);
  if (!q) return;
  q.subtasks.push({ id: uid(), title: title.trim().slice(0, 120), done: false });
  commit();
}

export function toggleSubtask(questId, subId) {
  const q = quest(questId);
  const s = q?.subtasks.find((x) => x.id === subId);
  if (!s) return null;
  s.done = !s.done;
  const payload = s.done ? awardXp(XP.subtask, 'step done') : awardXp(-XP.subtask, 'step undone');
  commit();
  return payload;
}

export function deleteSubtask(questId, subId) {
  const q = quest(questId);
  if (!q) return;
  q.subtasks = q.subtasks.filter((s) => s.id !== subId);
  commit();
}

/* ---------- journal ---------- */

export function journalEntries({ search = '', month = null } = {}) {
  let list = db.journal.slice();
  if (month) list = list.filter((e) => e.date.startsWith(month));
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((e) => (e.title || '').toLowerCase().includes(s) ||
      (e.body || '').toLowerCase().includes(s));
  }
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function journalFor(date) {
  return db.journal.find((e) => e.date === date) || null;
}

export function upsertJournal(date, patch) {
  let e = journalFor(date);
  const fresh = !e;
  if (!e) {
    e = {
      id: uid(), date, title: '', body: '', mood: 3, attachments: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    db.journal.push(e);
  }
  Object.assign(e, patch, { updatedAt: Date.now() });
  if (fresh) {
    db.stats.journalDays = (db.stats.journalDays || 0) + 1;
    touchActivity('j');
    awardXp(XP.journal, 'chronicle entry');
  }
  commit({ silent: patch.__silent === true });
  return e;
}

export function deleteJournal(date) {
  db.journal = db.journal.filter((e) => e.date !== date);
  db.stats.journalDays = Math.max(0, (db.stats.journalDays || 0) - 1);
  commit();
  sweepMedia();
}

/* ---------- profile & settings ---------- */

export function setName(name) {
  db.profile.name = (name || '').trim().slice(0, 24) || 'Wanderer';
  db.settings.firstRun = false;
  commit({ immediate: true });
}

export function setAvatar(a) { db.profile.avatar = a; commit(); }

export function setSetting(k, v) {
  db.settings[k] = v;
  commit({ immediate: true });
  return v;
}

/* ---------- search across everything ---------- */

export function searchAll(term) {
  const s = (term || '').trim().toLowerCase();
  if (s.length < 2) return [];
  const hits = [];
  db.notes.filter((n) => !n.trashed).forEach((n) => {
    const hay = `${n.title} ${n.body}`.toLowerCase();
    if (hay.includes(s)) hits.push({ type: 'note', id: n.id, title: n.title || 'Untitled scroll',
      sub: excerpt(n.body, s), ts: n.updatedAt, folderId: n.folderId });
  });
  db.quests.forEach((q) => {
    const hay = `${q.title} ${q.notes || ''}`.toLowerCase();
    if (hay.includes(s)) hits.push({ type: 'quest', id: q.id, title: q.title,
      sub: q.done ? 'completed' : (q.due ? `due ${prettyDate(q.due)}` : 'open quest'),
      ts: q.createdAt, folderId: q.folderId });
  });
  db.journal.forEach((e) => {
    const hay = `${e.title} ${e.body}`.toLowerCase();
    if (hay.includes(s)) hits.push({ type: 'journal', id: e.date, title: e.title || prettyDate(e.date),
      sub: excerpt(e.body, s), ts: e.updatedAt });
  });
  db.folders.forEach((f) => {
    if (f.name.toLowerCase().includes(s))
      hits.push({ type: 'folder', id: f.id, title: f.name, sub: 'chamber', ts: f.createdAt });
  });
  return hits.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 60);
}

function excerpt(body, term) {
  const b = (body || '').replace(/\s+/g, ' ');
  const i = b.toLowerCase().indexOf(term);
  if (i < 0) return b.slice(0, 70);
  return (i > 18 ? '...' : '') + b.slice(Math.max(0, i - 18), Math.max(0, i - 18) + 72);
}

/* ---------- dashboard aggregation ---------- */

export function dashboardData() {
  const t = todayISO();
  const open = db.quests.filter((q) => !q.done);
  const overdue = open.filter((q) => q.due && q.due < t);
  const dueToday = open.filter((q) => q.due === t);
  const upcoming = open.filter((q) => q.due && q.due > t && q.due <= addDays(t, 7));
  const doneToday = db.quests.filter((q) => q.done && q.completedAt &&
    ymd(new Date(q.completedAt)) === t);
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const iso = addDays(t, -i);
    const h = db.stats.history[iso] || { q: 0, n: 0, j: 0 };
    week.push({ iso, ...h, total: h.q + h.n + h.j, isToday: iso === t });
  }
  return {
    open, overdue, dueToday, upcoming, doneToday, week,
    lvl: levelFor(db.profile.xp),
    recentNotes: notes().slice(0, 4),
    journalToday: journalFor(t),
    totals: {
      notes: db.notes.filter((n) => !n.trashed).length,
      folders: db.folders.length,
      quests: db.quests.length,
      journal: db.journal.length,
    },
  };
}

/* ---------- backup / restore ---------- */

export function exportObject() {
  return {
    app: 'GRIMOIRE',
    kind: 'grimoire-backup',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: db,
  };
}

export function exportJSON() {
  return JSON.stringify(exportObject(), null, 2);
}

/**
 * Backup including the photos, which live outside localStorage.
 * Photos make a backup much bigger, so the caller decides.
 */
export async function exportObjectWithMedia({ photos = true } = {}) {
  const out = exportObject();
  if (!photos) return out;
  try {
    const m = await import('./media.js');
    const used = usedMediaIds();
    const list = await m.all();
    out.media = list.filter((r) => used.has(r.id));
  } catch { out.media = []; }
  return out;
}

/** Writes any photos carried by a backup back into IndexedDB. */
export async function importMedia(list) {
  if (!Array.isArray(list) || !list.length) return 0;
  try {
    const m = await import('./media.js');
    return await m.importAll(list);
  } catch { return 0; }
}

export function backupFilename() {
  const d = new Date();
  const who = (db.profile.name || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `grimoire-${who}-${ymd(d)}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;
}

export function markBackedUp() {
  db.settings.lastBackupAt = Date.now();
  commit({ immediate: true });
}

/** Validates a parsed backup file. Returns {ok, data|error, summary}. */
export function inspectBackup(parsed) {
  try {
    const payload = parsed?.data && parsed?.kind === 'grimoire-backup' ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Not a valid file.' };
    const need = ['notes', 'quests', 'journal', 'folders'];
    if (!need.some((k) => Array.isArray(payload[k])))
      return { ok: false, error: 'No grimoire data found inside.' };
    return {
      ok: true,
      data: payload,
      summary: {
        name: payload.profile?.name || '—',
        notes: (payload.notes || []).length,
        quests: (payload.quests || []).length,
        journal: (payload.journal || []).length,
        folders: (payload.folders || []).length,
        xp: payload.profile?.xp || 0,
        photos: Array.isArray(parsed?.media) ? parsed.media.length : 0,
        exportedAt: parsed?.exportedAt || null,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * A backup file is `{app, kind, version, exportedAt, data}` but the
 * grimoire itself is the `data` part. Accept either shape so a
 * caller cannot silently restore an empty grimoire.
 */
function unwrap(payload) {
  if (payload && payload.kind === 'grimoire-backup' && payload.data) return payload.data;
  return payload;
}

export function restoreReplace(payload) {
  snapshot('before-restore');
  db = migrate(unwrap(payload));
  saveNow();
  listeners.forEach((fn) => fn(db));
  sweepMedia();
}

/** Union merge - keeps both sides, newest wins on id collisions. */
export function restoreMerge(payload) {
  snapshot('before-merge');
  const inc = migrate(unwrap(payload));

  const mergeById = (mine, theirs, stamp = 'updatedAt') => {
    const map = new Map(mine.map((x) => [x.id, x]));
    theirs.forEach((x) => {
      const existing = map.get(x.id);
      if (!existing) map.set(x.id, x);
      else if ((x[stamp] || 0) > (existing[stamp] || 0)) map.set(x.id, x);
    });
    return [...map.values()];
  };

  db.folders = mergeById(db.folders, inc.folders, 'createdAt');
  db.notes = mergeById(db.notes, inc.notes);
  db.quests = mergeById(db.quests, inc.quests, 'createdAt');

  const jmap = new Map(db.journal.map((e) => [e.date, e]));
  inc.journal.forEach((e) => {
    const cur = jmap.get(e.date);
    if (!cur) jmap.set(e.date, e);
    else if ((e.updatedAt || 0) > (cur.updatedAt || 0)) jmap.set(e.date, e);
  });
  db.journal = [...jmap.values()];

  db.profile.xp = Math.max(db.profile.xp, inc.profile.xp || 0);
  db.stats.longestStreak = Math.max(db.stats.longestStreak, inc.stats.longestStreak || 0);
  db.stats.history = { ...(inc.stats.history || {}), ...(db.stats.history || {}) };
  db.stats.notesWritten = db.notes.length;
  db.stats.journalDays = db.journal.length;
  db.stats.questsCompleted = db.quests.filter((q) => q.done).length;

  // Any folder whose parent vanished gets lifted to the root.
  const ids = new Set(db.folders.map((f) => f.id));
  db.folders.forEach((f) => { if (f.parentId && !ids.has(f.parentId)) f.parentId = null; });

  saveNow();
  listeners.forEach((fn) => fn(db));
}

/* ---------- local safety snapshots ---------- */

export function snapshot(label = 'auto') {
  try {
    const list = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]');
    list.unshift({ at: Date.now(), label, json: JSON.stringify(db) });
    localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, 3)));
  } catch (e) { /* storage full - not fatal */ }
}

export function snapshots() {
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]')
      .map((s, i) => ({ i, at: s.at, label: s.label, bytes: s.json.length * 2 }));
  } catch { return []; }
}

export function restoreSnapshot(i) {
  try {
    const list = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]');
    if (!list[i]) return false;
    db = migrate(JSON.parse(list[i].json));
    saveNow();
    listeners.forEach((fn) => fn(db));
    return true;
  } catch { return false; }
}

export function wipeEverything() {
  snapshot('before-wipe');
  db = defaultDB();
  saveNow();
  listeners.forEach((fn) => fn(db));
  sweepMedia();
}

/* ---------- sample content for a brand-new grimoire ---------- */

export function seedStarter() {
  const life = createFolder({ name: 'Life', icon: 'tower' });
  const work = createFolder({ name: 'Work', icon: 'sword' });
  const ideas = createFolder({ name: 'Ideas', icon: 'potion' });
  const errands = createFolder({ name: 'Errands', parentId: life.id, icon: 'map' });
  createFolder({ name: 'Recipes', parentId: life.id, icon: 'chest' });
  const proj = createFolder({ name: 'Projects', parentId: work.id, icon: 'shield' });
  createFolder({ name: 'Meetings', parentId: work.id, icon: 'crown' });

  createNote({
    folderId: ideas.id,
    title: 'How this grimoire works',
    body: [
      'Welcome, traveller.',
      '',
      'SCROLLS are your notes. They live in chambers (folders), and chambers',
      'can sit inside other chambers, as deep as you like.',
      '',
      'CHRONICLE is your journal: one entry per day, with a mood.',
      '',
      'QUESTS are your to-dos. Finishing one earns XP. Epic quests earn more.',
      'Enough XP and you rank up.',
      '',
      'THE KEEP is the dashboard - streak, level, what is due, what you wrote.',
      '',
      'Everything is stored on this device only. Nothing is uploaded.',
      'Use Options > Backup now and then, and keep the file somewhere safe.',
    ].join('\n'),
  });
  createNote({
    folderId: proj.id,
    title: 'Project scratchpad',
    body: 'Tap the pencil to edit. Notes save themselves as you type.',
  });

  createQuest({ folderId: errands.id, title: 'Restock provisions', priority: 'normal', due: todayISO() });
  createQuest({ folderId: proj.id, title: 'Slay the inbox dragon', priority: 'high', due: addDays(todayISO(), 1) });
  createQuest({ folderId: null, title: 'Read the scroll of welcome', priority: 'low' });
  const epic = createQuest({ folderId: work.id, title: 'Finish the great works', priority: 'epic',
    due: addDays(todayISO(), 14) });
  addSubtask(epic.id, 'Draw the map');
  addSubtask(epic.id, 'Gather the party');
  addSubtask(epic.id, 'Set out at dawn');
  commit({ immediate: true });
}
