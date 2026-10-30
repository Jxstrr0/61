// The rules engine for 61 - A Trivia Game: a state machine with no DOM
// access. The UI renders the state and sends actions; the tests drive it
// from Node.
//
// Time: the engine never reads the clock. Every action carries `now` (ms,
// any monotonic clock) and the UI sends {type: "tick", now} regularly so
// the engine can open buzzers, land CPU buzzes and expire timers. All
// comparisons are by timestamp, so a late tick still resolves in the
// right order (a CPU scheduled at 600 ms beats a human buzz at 800 ms).
//
// Randomness: every roll goes through state.rng (src/rng.js), so a board +
// seed replays identically and a saved game resumes exactly.
//
// `dispatch(state, action)` updates the state in place and returns it. It
// also returns `state.lastEvents`, the log entries that action produced, so
// the UI can play sounds and animations for them.
//
// Phases:  intro -> board <-> clue -> roundEnd -> board ... -> final -> results

import { random, pick as pickOne, createRng } from "./rng.js";
import { matchAnswer } from "./match.js";
import * as cpu from "./cpu.js";

export const TIMING = {
  readMsPerWord: 250,
  readMinMs: 1500,
  readMaxMs: 6000,
  lockoutMs: 250,        // early buzz penalty
  tieMs: 15,             // buzzes this close go to the human
  openWindowMs: 5000,    // how long buzzers stay open with nobody buzzing
  reboundWindowMs: 3000, // after a wrong answer, for the others
  answerMs: 10000,       // human typing time
  cpuAnswerMs: 1500,     // a CPU "speaks" for this long before its result lands
  finalThinkMs: 30000,
};

export const DD_MIN_WAGER = 5;
export const ROW_VALUES = [200, 400, 600, 800, 1000];

/** Reading delay before the go-light: clamp(words × 250 ms, 1.5 s, 6 s). */
export function readingDelay(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(TIMING.readMaxMs, Math.max(TIMING.readMinMs, words * TIMING.readMsPerWord));
}

export const clueId = (round, cat, row) => `${round}-${cat}-${row}`;

/** Looks a clue up by id: { clue, category, round, roundIndex, catIndex, row }. */
export function findClue(board, id) {
  const [r, c, i] = id.split("-").map(Number);
  const round = board.rounds[r];
  const category = round?.categories[c];
  const clue = category?.clues[i];
  if (!clue) return null;
  return { clue, category, round, roundIndex: r, catIndex: c, row: i };
}

// ---------------------------------------------------------------------------
// Creating a game
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {object} options.board        a validated board
 * @param {number} options.seed
 * @param {"easy"|"normal"|"hard"} options.difficulty
 * @param {object[]} options.roster     entries from data/opponents.json
 * @param {string} [options.playerName]
 */
export function createGame({ board, seed, difficulty = "normal", roster, playerName = "You" }) {
  const rng = createRng(seed);
  const opponents = cpu.pickOpponents(rng, roster, difficulty, board.tags ?? []);
  const state = {
    version: 1,
    boardId: board.id,
    board,
    seed: rng.seed,
    difficulty,
    rng,
    phase: "intro",
    round: 0,
    controller: 0,
    contestants: [
      { id: "you", name: playerName, colour: "you", isHuman: true, score: 0 },
      ...opponents,
    ],
    used: {},            // clueId -> true
    clue: null,          // the clue in play (see openClue)
    final: null,
    nudged: [false, false], // phrasing nudge shown this round?
    log: [],
    lastEvents: [],
  };
  return state;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logEvent(state, now, event) {
  const entry = { t: now, ...event };
  state.log.push(entry);
  state.lastEvents.push(entry);
  return entry;
}

function fail(state, message) {
  // Illegal actions are ignored but recorded, so the UI can show nothing
  // and the tests can assert on them.
  state.lastEvents.push({ type: "ignored", message });
  return state;
}

export function roundMaxValue(state) {
  return ROW_VALUES[4] * state.board.rounds[state.round].multiplier;
}

export function cluesLeftInRound(state) {
  const round = state.board.rounds[state.round];
  let left = 0;
  round.categories.forEach((cat, c) => cat.clues.forEach((_, i) => {
    if (!state.used[clueId(state.round, c, i)]) left += 1;
  }));
  return left;
}

/** Unused clue ids in the current round. */
export function availableClues(state) {
  const ids = [];
  const round = state.board.rounds[state.round];
  round.categories.forEach((cat, c) => cat.clues.forEach((_, i) => {
    const id = clueId(state.round, c, i);
    if (!state.used[id]) ids.push(id);
  }));
  return ids;
}

/** The clue a CPU controller picks: a random category, its top remaining value. */
export function chooseClueForCpu(state) {
  const round = state.board.rounds[state.round];
  const categories = [];
  round.categories.forEach((cat, c) => {
    const rows = cat.clues.map((_, i) => i).filter((i) => !state.used[clueId(state.round, c, i)]);
    if (rows.length) categories.push({ c, row: rows[0] });
  });
  if (!categories.length) return null;
  const choice = pickOne(state.rng, categories);
  return clueId(state.round, choice.c, choice.row);
}

function scoreOf(state, index) {
  return state.contestants[index].score;
}

function applyDelta(state, now, index, delta, extra) {
  state.contestants[index].score += delta;
  return logEvent(state, now, { type: "score", contestant: index, delta, ...extra });
}

/** Pre-rolls what each CPU does with the open clue. */
function scheduleCpuBuzzes(state, openedAt, firstTime) {
  const { clue } = state;
  const info = findClue(state.board, clue.id);
  const tags = info.category.tags ?? [];
  state.contestants.forEach((contestant, index) => {
    if (contestant.isHuman || clue.attempted.includes(index)) return;
    let plan = clue.cpu[index];
    if (firstTime) {
      const knows = cpu.rollKnows(state.rng, contestant, info.row, tags);
      const buzzes = knows || cpu.rollWrongBuzz(state.rng, contestant);
      plan = { knows, buzzes, buzzAt: null };
      clue.cpu[index] = plan;
    }
    plan.buzzAt = plan.buzzes ? openedAt + cpu.rollReaction(state.rng, contestant) : null;
  });
}

function openBuzzers(state, at, windowMs, firstTime) {
  const { clue } = state;
  clue.state = "open";
  clue.openedAt = at;
  clue.windowEndsAt = at + windowMs;
  // an early-buzz lockout from the reading phase carries over into the open window
  scheduleCpuBuzzes(state, at, firstTime);
  logEvent(state, at, { type: "buzzers.open", clueId: clue.id, rebound: !firstTime });
}

/** Earliest CPU buzz that is due by `now` among contestants still eligible. */
function dueCpuBuzz(state, now) {
  const { clue } = state;
  let best = null;
  for (const [index, plan] of Object.entries(clue.cpu)) {
    const i = Number(index);
    if (plan.buzzAt === null || clue.attempted.includes(i)) continue;
    if (plan.buzzAt <= now && plan.buzzAt <= clue.windowEndsAt && (!best || plan.buzzAt < best.at)) {
      best = { index: i, at: plan.buzzAt };
    }
  }
  return best;
}

function awardBuzz(state, index, at) {
  const { clue } = state;
  clue.state = "answering";
  clue.answerer = index;
  clue.buzzedAt = at;
  const contestant = state.contestants[index];
  if (contestant.isHuman) {
    clue.deadline = at + TIMING.answerMs;
  } else {
    clue.resolveAt = at + TIMING.cpuAnswerMs;
  }
  logEvent(state, at, { type: "buzz", clueId: clue.id, contestant: index, reaction: at - clue.openedAt });
}

function startAnswering(state, index, now, deadline) {
  const { clue } = state;
  clue.state = "answering";
  clue.answerer = index;
  if (state.contestants[index].isHuman) clue.deadline = deadline;
  else clue.resolveAt = now + TIMING.cpuAnswerMs;
}

/** Applies a correct/wrong result for the current answerer. */
function resolveAnswer(state, now, { correct, text, matched }) {
  const { clue } = state;
  const index = clue.answerer;
  const value = clue.wager ?? clue.value;
  const delta = correct ? value : -value;
  clue.attempted.push(index);
  applyDelta(state, now, index, delta, {
    clueId: clue.id,
    kind: clue.wager != null ? "dailyDouble" : "clue",
    correct,
    text: text ?? "",
    matched: matched ?? null,
  });
  if (correct) {
    state.controller = index;
    finishClue(state, now, { answered: true, by: index });
    return;
  }
  if (clue.wager != null) {
    // Daily Double: nobody else gets a shot
    finishClue(state, now, { answered: false });
    return;
  }
  const remaining = state.contestants.map((_, i) => i).filter((i) => !clue.attempted.includes(i));
  if (!remaining.length) {
    finishClue(state, now, { answered: false });
    return;
  }
  openBuzzers(state, now, TIMING.reboundWindowMs, false);
}

function finishClue(state, now, outcome) {
  const { clue } = state;
  clue.state = "resolved";
  clue.answerer = null;
  state.used[clue.id] = true;
  logEvent(state, now, { type: "clue.resolved", clueId: clue.id, ...outcome, controller: state.controller });
}

function startRound(state, now, roundIndex) {
  state.round = roundIndex;
  state.phase = "board";
  state.clue = null;
  if (roundIndex > 0) {
    // the contestant with the lowest score picks first (human wins ties)
    let lowest = 0;
    state.contestants.forEach((c, i) => { if (c.score < state.contestants[lowest].score) lowest = i; });
    state.controller = lowest;
  }
  logEvent(state, now, { type: "round.start", round: roundIndex, controller: state.controller });
}

function endRound(state, now) {
  state.phase = "roundEnd";
  state.clue = null;
  logEvent(state, now, { type: "round.end", round: state.round, scores: state.contestants.map((c) => c.score) });
}

function startFinal(state, now) {
  const eligible = state.contestants.map((_, i) => i).filter((i) => scoreOf(state, i) > 0);
  state.phase = "final";
  state.final = {
    stage: "category",
    eligible,
    wagers: {},
    knows: {},       // CPU correctness, pre-rolled
    ruling: null,    // human's self-ruling
    thinkEndsAt: null,
    revealOrder: eligible.slice().sort((a, b) => scoreOf(state, a) - scoreOf(state, b) || b - a),
    revealed: [],
    entryScores: state.contestants.map((c) => c.score),
  };
  for (const i of eligible) {
    if (!state.contestants[i].isHuman) state.final.knows[i] = cpu.rollFinalKnows(state.rng, state.contestants[i]);
  }
  logEvent(state, now, { type: "final.start", eligible });
  if (!eligible.length) endGame(state, now);
}

function endGame(state, now) {
  state.phase = "results";
  state.final = state.final ? { ...state.final, stage: "done" } : null;
  const scores = state.contestants.map((c) => c.score);
  const top = Math.max(...scores);
  const winners = scores.map((s, i) => (s === top ? i : -1)).filter((i) => i >= 0);
  state.winners = winners;
  logEvent(state, now, { type: "game.end", scores, winners });
}

function humanIndex(state) {
  return state.contestants.findIndex((c) => c.isHuman);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const handlers = {
  start(state, { now }) {
    if (state.phase !== "intro") return fail(state, "game already started");
    logEvent(state, now, { type: "game.start", seed: state.seed, boardId: state.boardId, difficulty: state.difficulty });
    startRound(state, now, 0);
    return state;
  },

  /** Picks a clue off the board (by the controller). */
  select(state, { now, clueId: id }) {
    if (state.phase !== "board") return fail(state, "not on the board");
    if (state.used[id]) return fail(state, "clue already played");
    const info = findClue(state.board, id);
    if (!info || info.roundIndex !== state.round) return fail(state, "no such clue in this round");
    const { clue, row } = info;
    state.phase = "clue";
    state.clue = {
      id,
      row,
      value: clue.value,
      text: clue.text,
      dailyDouble: Boolean(clue.dailyDouble),
      state: clue.dailyDouble ? "wager" : "reading",
      readingEndsAt: null,
      openedAt: null,
      windowEndsAt: null,
      lockoutUntil: 0,
      attempted: [],
      cpu: {},
      answerer: null,
      wager: null,
      pending: null, // borderline answer awaiting the player's ruling
    };
    logEvent(state, now, { type: "clue.select", clueId: id, by: state.controller, dailyDouble: state.clue.dailyDouble });
    if (clue.dailyDouble) {
      const picker = state.controller;
      state.clue.answerer = picker;
      if (!state.contestants[picker].isHuman) {
        const amount = cpu.dailyDoubleWager(state.rng, state.contestants[picker], scoreOf(state, picker), roundMaxValue(state));
        placeDailyDoubleWager(state, now, amount);
      }
    } else {
      state.clue.readingEndsAt = now + readingDelay(clue.text);
    }
    return state;
  },

  /** Human Daily Double wager. */
  wager(state, { now, amount }) {
    const { clue } = state;
    if (state.phase !== "clue" || !clue || clue.state !== "wager") return fail(state, "no wager pending");
    if (!state.contestants[clue.answerer].isHuman) return fail(state, "not your wager");
    const { min, max } = cpu.dailyDoubleLimits(scoreOf(state, clue.answerer), roundMaxValue(state));
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n < min || n > max) return fail(state, `wager must be between ${min} and ${max}`);
    placeDailyDoubleWager(state, now, n);
    return state;
  },

  /** Human buzz: tap on the clue card or the space bar. */
  buzz(state, { now }) {
    const { clue } = state;
    if (state.phase !== "clue" || !clue) return fail(state, "nothing to buzz on");
    const me = humanIndex(state);
    if (clue.state === "reading") {
      clue.lockoutUntil = now + TIMING.lockoutMs;
      logEvent(state, now, { type: "lockout", clueId: clue.id, contestant: me, until: clue.lockoutUntil });
      return state;
    }
    if (clue.state !== "open") return fail(state, "buzzers are not open");
    if (clue.attempted.includes(me)) return fail(state, "you already answered this clue");
    if (now < clue.lockoutUntil) return fail(state, "locked out");
    if (now > clue.windowEndsAt) return handlers.tick(state, { now });
    // Did a CPU beat you to it? Ties within tieMs go to the human.
    const rival = dueCpuBuzz(state, now - TIMING.tieMs);
    if (rival) {
      logEvent(state, now, { type: "buzz.lost", clueId: clue.id, contestant: me, behindMs: now - rival.at });
      awardBuzz(state, rival.index, rival.at);
      return state;
    }
    awardBuzz(state, me, now);
    return state;
  },

  /** Human typed answer. */
  answer(state, { now, text }) {
    const { clue } = state;
    if (state.phase !== "clue" || !clue || clue.state !== "answering") return fail(state, "not answering");
    const me = clue.answerer;
    if (!state.contestants[me].isHuman) return fail(state, "not your answer");
    const info = findClue(state.board, clue.id);
    const verdict = matchAnswer(text, info.clue);
    if (verdict.phrased === false && !state.nudged[state.round] && String(text).trim()) {
      state.nudged[state.round] = true;
      logEvent(state, now, { type: "nudge", clueId: clue.id });
    }
    if (verdict.result === "borderline") {
      clue.state = "ruling";
      clue.pending = { text, matched: verdict.matched };
      logEvent(state, now, { type: "borderline", clueId: clue.id, text, matched: verdict.matched });
      return state;
    }
    resolveAnswer(state, now, { correct: verdict.result === "correct", text, matched: verdict.matched });
    return state;
  },

  /** The player rules a borderline answer right or wrong. */
  rule(state, { now, correct }) {
    const { clue } = state;
    if (state.phase !== "clue" || !clue || clue.state !== "ruling") return fail(state, "nothing to rule on");
    const { text, matched } = clue.pending;
    clue.pending = null;
    logEvent(state, now, { type: "ruling", clueId: clue.id, correct: Boolean(correct) });
    resolveAnswer(state, now, { correct: Boolean(correct), text, matched });
    return state;
  },

  /** Moves on: from a resolved clue, a round end, or through the Final's stages. */
  next(state, { now }) {
    if (state.phase === "clue" && state.clue?.state === "resolved") {
      state.clue = null;
      if (cluesLeftInRound(state) === 0) endRound(state, now);
      else state.phase = "board";
      return state;
    }
    if (state.phase === "roundEnd") {
      if (state.round + 1 < state.board.rounds.length) startRound(state, now, state.round + 1);
      else startFinal(state, now);
      return state;
    }
    if (state.phase === "final") return advanceFinal(state, now);
    return fail(state, "nothing to move on from");
  },

  /** Human Final wager (0 to full score). */
  finalWager(state, { now, amount }) {
    const f = state.final;
    if (state.phase !== "final" || f.stage !== "wager") return fail(state, "no final wager pending");
    const me = humanIndex(state);
    if (!f.eligible.includes(me)) return fail(state, "you are not in the final");
    if (me in f.wagers) return fail(state, "already wagered");
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n < 0 || n > scoreOf(state, me)) return fail(state, `wager must be between 0 and ${scoreOf(state, me)}`);
    f.wagers[me] = n;
    logEvent(state, now, { type: "final.wager", contestant: me, amount: n });
    return state;
  },

  /** Human is done writing (before the 30 s runs out). */
  finalAnswer(state, { now }) {
    const f = state.final;
    if (state.phase !== "final" || f.stage !== "clue") return fail(state, "not the final clue");
    f.stage = f.eligible.includes(humanIndex(state)) ? "ruling" : "reveal";
    logEvent(state, now, { type: "final.answered" });
    return state;
  },

  /** The player rules their own handwritten final right or wrong. */
  finalRule(state, { now, correct }) {
    const f = state.final;
    if (state.phase !== "final" || f.stage !== "ruling") return fail(state, "nothing to rule on");
    f.ruling = Boolean(correct);
    f.stage = "reveal";
    logEvent(state, now, { type: "final.ruling", correct: f.ruling });
    return state;
  },

  /** Clock tick: opens buzzers, lands CPU buzzes, expires timers. */
  tick(state, { now }) {
    if (state.phase === "clue" && state.clue) tickClue(state, now);
    else if (state.phase === "final") tickFinal(state, now);
    return state;
  },
};

function placeDailyDoubleWager(state, now, amount) {
  const { clue } = state;
  clue.wager = amount;
  clue.state = "reading";
  clue.readingEndsAt = now + readingDelay(clue.text);
  logEvent(state, now, { type: "dd.wager", clueId: clue.id, contestant: clue.answerer, amount });
}

function tickClue(state, now) {
  const { clue } = state;
  // Loop because one tick may pass several boundaries (reading end, then a CPU buzz, then its answer).
  for (let guard = 0; guard < 10; guard += 1) {
    if (clue.state === "reading") {
      if (now < clue.readingEndsAt) return;
      if (clue.wager != null) {
        // Daily Double: the picker answers alone, no buzz race
        const picker = clue.answerer;
        const at = clue.readingEndsAt;
        clue.openedAt = at;
        if (state.contestants[picker].isHuman) {
          startAnswering(state, picker, at, at + TIMING.answerMs);
        } else {
          const info = findClue(state.board, clue.id);
          clue.cpu[picker] = { knows: cpu.rollKnows(state.rng, state.contestants[picker], info.row, info.category.tags ?? []), buzzes: false, buzzAt: null };
          startAnswering(state, picker, at, null);
        }
        continue;
      }
      openBuzzers(state, clue.readingEndsAt, TIMING.openWindowMs, true);
      continue;
    }
    if (clue.state === "open") {
      const due = dueCpuBuzz(state, now);
      if (due) { awardBuzz(state, due.index, due.at); continue; }
      if (now >= clue.windowEndsAt) {
        finishClue(state, clue.windowEndsAt, { answered: false, noBuzz: true });
      }
      return;
    }
    if (clue.state === "answering") {
      const answerer = state.contestants[clue.answerer];
      if (answerer.isHuman) {
        if (now >= clue.deadline) resolveAnswer(state, clue.deadline, { correct: false, text: "", matched: null, timeout: true });
        else return;
      } else {
        if (now < clue.resolveAt) return;
        const plan = clue.cpu[clue.answerer];
        const info = findClue(state.board, clue.id);
        resolveAnswer(state, clue.resolveAt, { correct: plan.knows, text: plan.knows ? info.clue.answer : "", matched: null });
      }
      if (clue.state !== "open") return;
      continue;
    }
    return; // wager, ruling, resolved: waiting on the player
  }
}

function advanceFinal(state, now) {
  const f = state.final;
  const me = humanIndex(state);
  switch (f.stage) {
    case "category": {
      f.stage = "wager";
      for (const i of f.eligible) {
        if (!state.contestants[i].isHuman) {
          f.wagers[i] = cpu.finalWager(state.rng, state.contestants[i], f.entryScores, i);
          logEvent(state, now, { type: "final.wager", contestant: i, amount: f.wagers[i] });
        }
      }
      if (!f.eligible.includes(me)) {
        // nothing for the player to wager: straight on to the clue
        f.stage = "clue";
        f.thinkEndsAt = now + TIMING.finalThinkMs;
        logEvent(state, now, { type: "final.clue" });
      }
      return state;
    }
    case "wager": {
      if (f.eligible.includes(me) && !(me in f.wagers)) return fail(state, "place your wager first");
      f.stage = "clue";
      f.thinkEndsAt = now + TIMING.finalThinkMs;
      logEvent(state, now, { type: "final.clue" });
      return state;
    }
    case "clue":
      return handlers.finalAnswer(state, { now });
    case "ruling":
      return fail(state, "rule your answer first");
    case "reveal": {
      const i = f.revealOrder[f.revealed.length];
      if (i === undefined) { endGame(state, now); return state; }
      const correct = state.contestants[i].isHuman ? Boolean(f.ruling) : Boolean(f.knows[i]);
      const wager = f.wagers[i] ?? 0;
      f.revealed.push(i);
      applyDelta(state, now, i, correct ? wager : -wager, { kind: "final", correct, wager });
      logEvent(state, now, { type: "final.reveal", contestant: i, correct, wager });
      if (f.revealed.length === f.revealOrder.length) endGame(state, now);
      return state;
    }
    default:
      return fail(state, "final is over");
  }
}

function tickFinal(state, now) {
  const f = state.final;
  if (f.stage === "clue" && now >= f.thinkEndsAt) handlers.finalAnswer(state, { now: f.thinkEndsAt });
}

/** Applies one action. Mutates and returns `state`; `state.lastEvents` holds what happened. */
export function dispatch(state, action) {
  state.lastEvents = [];
  const handler = handlers[action.type];
  if (!handler) return fail(state, `unknown action ${action.type}`);
  if (typeof action.now !== "number") return fail(state, `action ${action.type} needs now`);
  return handler(state, action);
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

/** Scores recomputed from the event log (the results screen and tests use this, not the running totals). */
export function scoresFromLog(state) {
  const scores = state.contestants.map(() => 0);
  for (const e of state.log) if (e.type === "score") scores[e.contestant] += e.delta;
  return scores;
}

/** Everything the results and stats screens need, computed from the log. */
export function summarize(state) {
  const me = humanIndex(state);
  const scores = scoresFromLog(state);
  const top = Math.max(...scores);
  const winners = scores.map((s, i) => (s === top ? i : -1)).filter((i) => i >= 0);

  // score after each resolved clue, per contestant, for the results graph
  const series = state.contestants.map(() => [0]);
  const running = state.contestants.map(() => 0);
  const byClue = {};
  const missed = [];
  const categories = {}; // tag -> { correct, attempted } for the human
  const byCategory = state.board.rounds.flatMap((round, r) => round.categories.map((cat) => ({ name: cat.name, round: r, correct: 0, attempted: 0 })));
  let buzzWon = 0, buzzLost = 0, reactionTotal = 0, reactionCount = 0;
  const dailyDouble = { correct: 0, attempted: 0 };
  const finalRecord = { correct: 0, attempted: 0 };

  for (const e of state.log) {
    if (e.type === "buzz" && e.contestant === me) { buzzWon += 1; reactionTotal += e.reaction; reactionCount += 1; }
    if (e.type === "buzz.lost") buzzLost += 1;
    if (e.type === "score") {
      running[e.contestant] += e.delta;
      if (e.kind === "final") { if (e.contestant === me) { finalRecord.attempted += 1; if (e.correct) finalRecord.correct += 1; } continue; }
      byClue[e.clueId] = byClue[e.clueId] ?? [];
      byClue[e.clueId].push(e);
      if (e.contestant === me) {
        const info = findClue(state.board, e.clueId);
        const tags = info.category.tags?.length ? info.category.tags : (state.board.tags ?? ["general"]);
        for (const tag of tags) {
          categories[tag] = categories[tag] ?? { correct: 0, attempted: 0 };
          categories[tag].attempted += 1;
          if (e.correct) categories[tag].correct += 1;
        }
        if (e.kind === "dailyDouble") { dailyDouble.attempted += 1; if (e.correct) dailyDouble.correct += 1; }
        const slot = byCategory[info.roundIndex * 6 + info.catIndex];
        slot.attempted += 1;
        if (e.correct) slot.correct += 1;
      }
    }
    if (e.type === "clue.resolved") {
      running.forEach((s, i) => series[i].push(s));
      const mine = (byClue[e.clueId] ?? []).find((x) => x.contestant === me);
      if (!mine || !mine.correct) {
        const info = findClue(state.board, e.clueId);
        missed.push({ clueId: e.clueId, category: info.category.name, value: info.clue.value, text: info.clue.text, answer: info.clue.answer, yours: mine ? mine.text : null });
      }
    }
  }

  return {
    boardId: state.boardId,
    seed: state.seed,
    difficulty: state.difficulty,
    scores,
    winners,
    playerWon: winners.includes(me),
    playerScore: scores[me],
    series,
    categories,
    byCategory,
    missed,
    buzz: { won: buzzWon, lost: buzzLost, averageReactionMs: reactionCount ? Math.round(reactionTotal / reactionCount) : null },
    dailyDouble,
    final: finalRecord,
    contestants: state.contestants.map((c) => ({ name: c.name, colour: c.colour, isHuman: c.isHuman })),
  };
}
