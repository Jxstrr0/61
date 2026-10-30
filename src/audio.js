// Sound cues, all synthesized with the Web Audio API so the repo ships no
// audio files. Every cue is a short original phrase (two or three notes at
// most); nothing here is meant to resemble any TV theme.
//
// Browsers only let audio start after a user gesture, so main.js calls
// unlock() on the first pointerdown/keydown. Until then play() is a no-op.
// The mute flag lives in settings (storage.js); we just hold a copy here.

let context = null;
let master = null;
let muted = false;
let finalLoop = null; // { stop() } while the Final music plays

export function setMuted(value) {
  muted = Boolean(value);
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

/** Creates (or resumes) the audio context. Call from a user gesture. */
export function unlock() {
  try {
    if (!context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      context = new Ctx();
      master = context.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
    return true;
  } catch {
    return false;
  }
}

/**
 * One note. type: oscillator shape; freq in Hz; at/dur in seconds relative to
 * now; peak gain; optional glide target in Hz for a little slide.
 */
function tone({ type = "sine", freq, at = 0, dur = 0.15, gain = 0.25, glide = null, attack = 0.005 }) {
  const t0 = context.currentTime + at;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short burst of filtered noise (for the thud and the lockout buzz). */
function noise({ at = 0, dur = 0.12, gain = 0.2, cutoff = 800 }) {
  const t0 = context.currentTime + at;
  const length = Math.ceil(context.sampleRate * dur);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const env = context.createGain();
  src.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(master);
  src.start(t0);
}

const CUES = {
  // the six category headers flipping in: a rising sweep
  boardReveal() {
    for (let i = 0; i < 6; i++) tone({ type: "triangle", freq: 330 * 2 ** (i / 6), at: i * 0.12, dur: 0.18, gain: 0.12 });
  },
  // a clue is picked
  categoryPop() {
    tone({ type: "triangle", freq: 660, dur: 0.08, gain: 0.15 });
  },
  // the go-light
  goLight() {
    tone({ type: "square", freq: 1320, dur: 0.05, gain: 0.08 });
  },
  // somebody buzzed in
  buzzIn() {
    tone({ type: "sine", freq: 880, dur: 0.12, gain: 0.2 });
    tone({ type: "sine", freq: 1320, at: 0.06, dur: 0.14, gain: 0.15 });
  },
  // buzzed too early
  lockout() {
    noise({ dur: 0.18, gain: 0.18, cutoff: 400 });
    tone({ type: "sawtooth", freq: 160, dur: 0.18, gain: 0.08 });
  },
  correct() {
    tone({ type: "sine", freq: 784, dur: 0.16, gain: 0.2 });
    tone({ type: "sine", freq: 1175, at: 0.1, dur: 0.3, gain: 0.18 });
  },
  wrong() {
    noise({ dur: 0.2, gain: 0.22, cutoff: 300 });
    tone({ type: "triangle", freq: 220, dur: 0.25, gain: 0.15, glide: 110 });
  },
  dailyDouble() {
    tone({ type: "square", freq: 523, dur: 0.12, gain: 0.08 });
    tone({ type: "square", freq: 659, at: 0.12, dur: 0.12, gain: 0.08 });
    tone({ type: "square", freq: 784, at: 0.24, dur: 0.12, gain: 0.08 });
    tone({ type: "square", freq: 1047, at: 0.36, dur: 0.4, gain: 0.1 });
  },
  roundEnd() {
    tone({ type: "triangle", freq: 659, dur: 0.2, gain: 0.14 });
    tone({ type: "triangle", freq: 523, at: 0.18, dur: 0.2, gain: 0.14 });
    tone({ type: "triangle", freq: 392, at: 0.36, dur: 0.5, gain: 0.14 });
  },
};

/** Plays a named cue (silently does nothing before unlock() or while muted). */
export function play(name) {
  if (!context || muted) return;
  const cue = CUES[name];
  if (!cue) return;
  try { cue(); } catch { /* audio is never worth crashing over */ }
}

/**
 * The Final-round thinking loop: a soft, slow four-bar arpeggio that repeats
 * for the 30 s think time. Original, deliberately plain, nothing like a TV
 * theme. stopFinalMusic() ends it early (when Done is pressed).
 */
export function startFinalMusic() {
  stopFinalMusic();
  if (!context || muted) return;
  const notes = [262, 330, 392, 494, 392, 330]; // C E G B G E
  const step = 0.42;
  let bar = 0;
  const schedule = () => {
    if (!finalLoop) return;
    const base = bar % 2 === 0 ? 1 : 0.84; // alternate between two chords
    notes.forEach((f, i) => tone({ type: "sine", freq: f * base, at: i * step, dur: step * 1.6, gain: 0.07, attack: 0.03 }));
    tone({ type: "triangle", freq: 131 * base, dur: notes.length * step, gain: 0.05, attack: 0.1 });
    bar += 1;
  };
  schedule();
  const timer = setInterval(schedule, notes.length * step * 1000);
  finalLoop = { stop() { clearInterval(timer); } };
}

export function stopFinalMusic() {
  if (finalLoop) { finalLoop.stop(); finalLoop = null; }
}
