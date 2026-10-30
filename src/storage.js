// Saves, career stats and settings in localStorage, all under versioned keys
// so a later change can migrate old data instead of breaking on it.
//
// Every function takes the storage as its last argument (default: the
// browser's localStorage) so the tests can pass a plain Map-like fake.
// Reads never throw: a missing or corrupt entry reads as "nothing saved".

const PREFIX = "sixtyone";
export const KEYS = {
  save: `${PREFIX}.v1.save`,
  stats: `${PREFIX}.v1.stats`,
  settings: `${PREFIX}.v1.settings`,
  played: `${PREFIX}.v1.played`,
  tutorial: `${PREFIX}.v1.tutorialSeen`,
};

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // some privacy modes throw on access
  }
}

function read(key, storage) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value, storage) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota or privacy mode: play on without saving
  }
}

function remove(key, storage) {
  try { storage?.removeItem(key); } catch { /* ignore */ }
}

// ---------- Save / resume ----------

/** Phases where the state has no timers running, so it can be saved and picked up later. */
export const SAVE_SAFE = new Set(["board", "roundEnd"]);

export function canSave(state) {
  return SAVE_SAFE.has(state.phase) || (state.phase === "final" && state.final?.stage === "category");
}

export function saveGame(state, storage = defaultStorage()) {
  if (!canSave(state)) return false;
  return write(KEYS.save, { savedAt: Date.now(), state }, storage);
}

export function loadGame(storage = defaultStorage()) {
  const entry = read(KEYS.save, storage);
  return entry?.state?.version === 1 ? entry.state : null;
}

export function clearGame(storage = defaultStorage()) {
  remove(KEYS.save, storage);
}

// ---------- Career stats ----------

export function emptyStats() {
  return {
    version: 1,
    games: 0,
    wins: 0,
    totalWinnings: 0,
    bestGame: null,
    currentStreak: 0,
    bestStreak: 0,
    categories: {},          // tag -> { correct, attempted }
    buzz: { won: 0, lost: 0, reactionTotalMs: 0, reactionCount: 0 },
    dailyDouble: { correct: 0, attempted: 0 },
    final: { correct: 0, attempted: 0 },
    byDifficulty: { easy: { games: 0, wins: 0 }, normal: { games: 0, wins: 0 }, hard: { games: 0, wins: 0 } },
  };
}

export function loadStats(storage = defaultStorage()) {
  const stats = read(KEYS.stats, storage);
  return stats?.version === 1 ? { ...emptyStats(), ...stats } : emptyStats();
}

export function saveStats(stats, storage = defaultStorage()) {
  return write(KEYS.stats, stats, storage);
}

export function resetStats(storage = defaultStorage()) {
  remove(KEYS.stats, storage);
  remove(KEYS.played, storage);
}

/** Pure: returns new stats with one finished game (a `summarize()` result) folded in. */
export function recordGame(stats, summary) {
  const next = structuredClone(stats);
  next.games += 1;
  if (summary.playerWon) {
    next.wins += 1;
    next.currentStreak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
  } else {
    next.currentStreak = 0;
  }
  if (summary.playerScore > 0) next.totalWinnings += summary.playerScore;
  next.bestGame = next.bestGame === null ? summary.playerScore : Math.max(next.bestGame, summary.playerScore);
  for (const [tag, record] of Object.entries(summary.categories)) {
    const slot = next.categories[tag] ?? { correct: 0, attempted: 0 };
    slot.correct += record.correct;
    slot.attempted += record.attempted;
    next.categories[tag] = slot;
  }
  next.buzz.won += summary.buzz.won;
  next.buzz.lost += summary.buzz.lost;
  if (summary.buzz.averageReactionMs !== null) {
    next.buzz.reactionTotalMs += summary.buzz.averageReactionMs * summary.buzz.won;
    next.buzz.reactionCount += summary.buzz.won;
  }
  next.dailyDouble.correct += summary.dailyDouble.correct;
  next.dailyDouble.attempted += summary.dailyDouble.attempted;
  next.final.correct += summary.final.correct;
  next.final.attempted += summary.final.attempted;
  const diff = next.byDifficulty[summary.difficulty] ?? { games: 0, wins: 0 };
  diff.games += 1;
  if (summary.playerWon) diff.wins += 1;
  next.byDifficulty[summary.difficulty] = diff;
  return next;
}

// ---------- Played boards ----------

export function loadPlayed(storage = defaultStorage()) {
  return read(KEYS.played, storage) ?? {}; // boardId -> { plays, best, last }
}

export function markPlayed(boardId, score, storage = defaultStorage()) {
  const played = loadPlayed(storage);
  const entry = played[boardId] ?? { plays: 0, best: null, last: null };
  entry.plays += 1;
  entry.best = entry.best === null ? score : Math.max(entry.best, score);
  entry.last = Date.now();
  played[boardId] = entry;
  write(KEYS.played, played, storage);
  return played;
}

// ---------- Settings ----------

export function defaultSettings() {
  return { muted: false, playerName: "You" };
}

export function loadSettings(storage = defaultStorage()) {
  return { ...defaultSettings(), ...(read(KEYS.settings, storage) ?? {}) };
}

export function saveSettings(settings, storage = defaultStorage()) {
  return write(KEYS.settings, settings, storage);
}

export function tutorialSeen(storage = defaultStorage()) {
  return read(KEYS.tutorial, storage) === true;
}

export function markTutorialSeen(storage = defaultStorage()) {
  write(KEYS.tutorial, true, storage);
}

/** A Map-backed stand-in for localStorage, for tests and the debug page. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    get length() { return map.size; },
  };
}
