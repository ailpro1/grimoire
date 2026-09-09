/* ============================================================
   GRIMOIRE - audio.js
   A tiny chiptune engine. Every sound is synthesised with
   WebAudio oscillators, so there are zero audio files to ship
   and the whole app still works offline.

   iOS note: an AudioContext starts "suspended" and may only be
   resumed from inside a real user gesture. unlock() is wired to
   the PRESS START button and to the first touch/click.
   ============================================================ */

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let unlocked = false;

const state = { sfx: true, music: false, volume: 0.55 };

/* ---------- setup ---------- */

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = state.volume;
  master.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(master);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);

  return ctx;
}

export function configure({ sfx, music, volume }) {
  if (sfx !== undefined) state.sfx = !!sfx;
  if (volume !== undefined) state.volume = Math.max(0, Math.min(1, volume));
  if (master) master.gain.value = state.volume;
  if (music !== undefined) {
    state.music = !!music;
    if (state.music) startMusic(); else stopMusic();
  }
}

export function isUnlocked() { return unlocked; }

export async function unlock() {
  const c = ensureCtx();
  if (!c) return false;
  try {
    if (c.state !== 'running') await c.resume();
    // A one-sample silent buffer is the classic iOS kick-starter.
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
    unlocked = c.state === 'running';
  } catch (e) {
    unlocked = false;
  }
  if (unlocked && state.music) startMusic();
  return unlocked;
}

/* ---------- voice primitives ---------- */

const NOTES = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6,
  G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };

/** "A4" / "C#5" -> Hz */
export function hz(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const semi = NOTES[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}

/**
 * One chip voice.
 * type: square | triangle | sawtooth | sine
 * slide: target frequency to glide to
 */
function voice({
  freq = 440, type = 'square', dur = 0.12, at = 0,
  gain = 0.22, attack = 0.005, decay = null, slide = null,
  detune = 0, destination = null,
} = {}) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);

  const rel = decay ?? dur;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + rel);

  osc.connect(g);
  g.connect(destination || sfxGain);
  osc.start(t0);
  osc.stop(t0 + rel + 0.02);
}

/** Filtered white noise - percussion, page turns, sparkles. */
function noise({ dur = 0.12, at = 0, gain = 0.16, from = 6000, to = 500, q = 1 } = {}) {
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + dur);

  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(t0);
}

/* ---------- the sound library ---------- */

const SFX = {
  /* navigation */
  move:   () => voice({ freq: hz('E5'), dur: 0.05, gain: 0.12, type: 'square' }),
  tab:    () => { voice({ freq: hz('A4'), dur: 0.05, gain: 0.14 });
                  voice({ freq: hz('E5'), dur: 0.07, gain: 0.14, at: 0.045 }); },
  select: () => { voice({ freq: hz('C5'), dur: 0.06, gain: 0.16 });
                  voice({ freq: hz('G5'), dur: 0.09, gain: 0.14, at: 0.055 }); },
  back:   () => { voice({ freq: hz('G4'), dur: 0.06, gain: 0.14 });
                  voice({ freq: hz('C4'), dur: 0.1,  gain: 0.12, at: 0.05 }); },
  toggle: () => voice({ freq: hz('B4'), dur: 0.04, gain: 0.13, type: 'square' }),

  /* writing */
  open:   () => { noise({ dur: 0.22, gain: 0.1, from: 1800, to: 320, q: 0.7 });
                  voice({ freq: hz('C4'), dur: 0.12, gain: 0.1, type: 'triangle' }); },
  close:  () => { noise({ dur: 0.18, gain: 0.09, from: 900, to: 2200, q: 0.7 });
                  voice({ freq: hz('G3'), dur: 0.12, gain: 0.1, type: 'triangle' }); },
  save:   () => { voice({ freq: hz('E5'), dur: 0.05, gain: 0.12 });
                  voice({ freq: hz('A5'), dur: 0.08, gain: 0.11, at: 0.05 }); },
  type:   () => voice({ freq: 1400 + Math.random() * 400, dur: 0.02, gain: 0.05, type: 'square' }),

  /* quests */
  check:  () => { voice({ freq: hz('C5'), dur: 0.05, gain: 0.16 });
                  voice({ freq: hz('E5'), dur: 0.05, gain: 0.16, at: 0.05 });
                  voice({ freq: hz('G5'), dur: 0.12, gain: 0.15, at: 0.1 }); },
  uncheck:() => { voice({ freq: hz('G4'), dur: 0.05, gain: 0.13 });
                  voice({ freq: hz('D4'), dur: 0.1,  gain: 0.12, at: 0.05 }); },
  coin:   () => { voice({ freq: hz('B5'), dur: 0.06, gain: 0.14 });
                  voice({ freq: hz('E6'), dur: 0.3,  gain: 0.13, at: 0.06, decay: 0.34 }); },
  step:   () => voice({ freq: hz('D5'), dur: 0.05, gain: 0.12 }),

  /* containers */
  folder: () => { voice({ freq: hz('D4'), dur: 0.06, gain: 0.12, type: 'triangle' });
                  voice({ freq: hz('A4'), dur: 0.08, gain: 0.11, at: 0.05, type: 'triangle' }); },
  chest:  () => { voice({ freq: hz('C4'), dur: 0.08, gain: 0.14, type: 'triangle' });
                  voice({ freq: hz('F4'), dur: 0.08, gain: 0.14, at: 0.08, type: 'triangle' });
                  voice({ freq: hz('C5'), dur: 0.22, gain: 0.13, at: 0.16 });
                  noise({ dur: 0.3, at: 0.16, gain: 0.05, from: 5000, to: 1200, q: 2 }); },

  /* system */
  error:  () => { voice({ freq: hz('A3'), dur: 0.1, gain: 0.16, type: 'sawtooth' });
                  voice({ freq: hz('Eb3'), dur: 0.22, gain: 0.15, at: 0.09, type: 'sawtooth' }); },
  warn:   () => { voice({ freq: hz('F4'), dur: 0.08, gain: 0.14, type: 'square' });
                  voice({ freq: hz('F4'), dur: 0.12, gain: 0.14, at: 0.12, type: 'square' }); },
  trash:  () => { noise({ dur: 0.26, gain: 0.14, from: 3200, to: 180, q: 0.8 });
                  voice({ freq: hz('E4'), dur: 0.26, gain: 0.12, slide: hz('E2'), type: 'sawtooth' }); },

  /* celebration */
  levelup: () => {
    const seq = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C6'];
    seq.forEach((n, i) => voice({
      freq: hz(n), dur: i === seq.length - 1 ? 0.5 : 0.1,
      at: i * 0.085, gain: 0.17, type: 'square',
      decay: i === seq.length - 1 ? 0.6 : 0.11,
    }));
    seq.forEach((n, i) => voice({
      freq: hz(n) / 2, dur: 0.1, at: i * 0.085, gain: 0.08, type: 'triangle',
    }));
    noise({ dur: 0.7, at: 0.55, gain: 0.05, from: 7000, to: 2000, q: 3 });
  },
  fanfare: () => {
    [['G4', 0], ['C5', 0.12], ['E5', 0.24], ['G5', 0.36], ['E5', 0.5], ['G5', 0.6]]
      .forEach(([n, t], i, arr) => voice({
        freq: hz(n), at: t, dur: i === arr.length - 1 ? 0.45 : 0.13,
        gain: 0.16, type: 'square', decay: i === arr.length - 1 ? 0.55 : 0.15,
      }));
  },
  start: () => {
    [['C5', 0], ['C5', 0.09], ['C5', 0.18], ['G4', 0.28], ['C5', 0.4], ['E5', 0.52], ['G5', 0.64]]
      .forEach(([n, t]) => voice({ freq: hz(n), at: t, dur: 0.14, gain: 0.16, type: 'square' }));
  },
};

export function play(name) {
  if (!state.sfx) return;
  const fn = SFX[name];
  if (!fn) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state !== 'running') { c.resume?.().catch(() => {}); return; }
  try { fn(); } catch (e) { /* never let a sound break the app */ }
}

/* Convenience aliases used around the UI. */
export const sfx = new Proxy({}, { get: (_, k) => () => play(k) });

/* ---------- procedural background music ----------
   A slow six-bar minor loop: triangle bass, square arpeggio and
   a soft lead. Scheduled with a look-ahead timer so it stays in
   time even when the main thread is busy rendering.
------------------------------------------------------ */

const SONG = {
  bpm: 84,
  // [root, chord tones] in A natural minor - a passable medieval mode
  bars: [
    ['A2', ['A3', 'C4', 'E4']],
    ['A2', ['A3', 'C4', 'E4']],
    ['F2', ['F3', 'A3', 'C4']],
    ['G2', ['G3', 'B3', 'D4']],
    ['E2', ['E3', 'G3', 'B3']],
    ['G2', ['G3', 'B3', 'D4']],
  ],
  lead: [
    'A4', null, 'C5', null, 'E5', null, 'D5', null,
    'C5', null, 'A4', null, null, null, null, null,
    'F4', null, 'A4', null, 'C5', null, 'A4', null,
    'G4', null, 'B4', null, 'D5', null, 'B4', null,
    'E4', null, 'G4', null, 'B4', null, 'G4', null,
    'D5', null, 'B4', null, 'A4', null, null, null,
  ],
};

let musicTimer = null;
let nextNoteTime = 0;
let stepIndex = 0;
const LOOKAHEAD = 0.12;

function scheduleStep(step, time) {
  const stepsPerBar = 8;
  const bar = Math.floor(step / stepsPerBar) % SONG.bars.length;
  const inBar = step % stepsPerBar;
  const [root, chord] = SONG.bars[bar];

  // bass on beats 1 and 5
  if (inBar === 0 || inBar === 4) {
    voice({ freq: hz(root), type: 'triangle', dur: 0.34, at: time,
      gain: 0.3, decay: 0.4, destination: musicGain });
  }
  // arpeggio on the off-steps
  if (inBar % 2 === 1) {
    const n = chord[Math.floor(inBar / 2) % chord.length];
    voice({ freq: hz(n), type: 'square', dur: 0.1, at: time,
      gain: 0.09, decay: 0.16, destination: musicGain });
  }
  // lead line
  const lead = SONG.lead[step % SONG.lead.length];
  if (lead) {
    voice({ freq: hz(lead), type: 'square', dur: 0.18, at: time,
      gain: 0.11, decay: 0.24, detune: -4, destination: musicGain });
  }
}

function musicLoop() {
  const c = ensureCtx();
  if (!c || !state.music) return;
  const stepDur = 60 / SONG.bpm / 2; // eighth notes
  while (nextNoteTime < c.currentTime + LOOKAHEAD) {
    const at = Math.max(0, nextNoteTime - c.currentTime);
    scheduleStep(stepIndex, at);
    stepIndex = (stepIndex + 1) % (SONG.bars.length * 8 * 2);
    nextNoteTime += stepDur;
  }
}

export function startMusic() {
  const c = ensureCtx();
  if (!c || musicTimer) return;
  if (c.state !== 'running') return; // waits for unlock()
  stepIndex = 0;
  nextNoteTime = c.currentTime + 0.1;
  musicGain.gain.cancelScheduledValues(c.currentTime);
  musicGain.gain.setValueAtTime(0.0001, c.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 1.6);
  musicTimer = setInterval(musicLoop, 45);
  musicLoop();
}

export function stopMusic() {
  const c = ctx;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (c && musicGain) {
    musicGain.gain.cancelScheduledValues(c.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.5);
  }
}

export function toggleMusic(on) {
  state.music = on;
  if (on) startMusic(); else stopMusic();
}

/* Pause music when the app goes to the background - iOS is picky
   about audio in backgrounded web apps, and it saves battery. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  } else if (state.music && ctx && ctx.state === 'running' && !musicTimer) {
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(musicLoop, 45);
  }
});

/* ---------- haptics (Android/desktop; iOS Safari ignores it) ---------- */

export function buzz(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}
