// Practice mode: an endless stream of clues against one Normal-pool
// opponent, to learn the buzzer. No scores, no board; just the race (and,
// in "answer" mode, the typing). Like game.js this is a pure state machine
// with no DOM: every action carries `now`, randomness comes from the seeded
// rng, and the UI only renders what is here.

import { TIMING, readingDelay } from "./game.js";
import { createRng, random, shuffle } from "./rng.js";
import * as cpu from "./cpu.js";
import { matchAnswer } from "./match.js";

export const PRACTICE_TIMING = {
  holdMs: 1800, // how long the answer stays up before the next clue
};

/**
 * @param {object} options
 * @param {object[]} options.clues   [{ text, answer, accept, strict, category, row }], any number
 * @param {number} options.seed
 * @param {"buzz"|"answer"} options.mode  buzz only, or buzz and type
 * @param {object[]} options.roster  data/opponents.json entries (a Normal one is picked)
 */
export function createPractice({ clues, seed, mode = "buzz", roster = [] }) {
  const rng = createRng(seed);
  const [opponent] = cpu.pickOpponents(rng, roster, "normal", []);
  return {
    version: 1,
    mode,
    rng,
    opponent: opponent ?? { name: "CPU", profile: cpu.POOLS.normal, strongTags: [], weakTags: [] },
    order: shuffle(rng, clues.map((_, i) => i)), // play every clue once before repeating
    cursor: 0,
    clues,
    clue: null,                 // the clue in play (see nextClue)
    stats: { seen: 0, won: 0, lostRace: 0, unanswered: 0, early: 0, reactions: [], correct: 0, attempted: 0 },
    lastEvents: [],
  };
}

/** Average of the player's winning buzz times, or null before the first win. */
export function averageReaction(stats) {
  if (!stats.reactions.length) return null;
  return Math.round(stats.reactions.reduce((a, b) => a + b, 0) / stats.reactions.length);
}

/** Share of races the player won (0–1), or null before any race finished. */
export function winRate(stats) {
  const races = stats.won + stats.lostRace + stats.unanswered;
  return races ? stats.won / races : null;
}

function emit(state, event) {
  state.lastEvents.push(event);
}

function nextClue(state, now) {
  if (state.cursor >= state.order.length) {
    state.order = shuffle(state.rng, state.order);
    state.cursor = 0;
  }
  const index = state.order[state.cursor++];
  const source = state.clues[index];
  const knows = cpu.rollKnows(state.rng, state.opponent, source.row ?? 2, []);
  state.clue = {
    index,
    text: source.text,
    answer: source.answer,
    category: source.category,
    state: "reading",
    readingEndsAt: now + readingDelay(source.text),
    openedAt: null,
    lockoutUntil: 0,
    cpu: { knows, buzzAt: null },
    deadline: null,
    result: null,  // { winner: "you"|"cpu"|null, reaction, correct, text }
    pending: null, // a borderline typed response awaiting your ruling
  };
  state.stats.seen += 1;
  emit(state, { type: "clue", index });
}

function open(state, now) {
  const c = state.clue;
  c.state = "open";
  c.openedAt = c.readingEndsAt;
  if (c.cpu.knows) c.cpu.buzzAt = c.openedAt + cpu.rollReaction(state.rng, state.opponent);
  else if (cpu.rollWrongBuzz(state.rng, state.opponent)) c.cpu.buzzAt = c.openedAt + cpu.rollReaction(state.rng, state.opponent);
  emit(state, { type: "open" });
  void now;
}

function resolve(state, now, result) {
  const c = state.clue;
  c.state = "resolved";
  c.result = result;
  c.nextAt = now + PRACTICE_TIMING.holdMs;
  if (result.winner === "you") {
    state.stats.won += 1;
    state.stats.reactions.push(result.reaction);
  } else if (result.winner === "cpu") state.stats.lostRace += 1;
  else state.stats.unanswered += 1;
  emit(state, { type: "resolved", ...result });
}

function cpuWins(state, now) {
  const c = state.clue;
  const correct = c.cpu.knows;
  resolve(state, now, { winner: "cpu", reaction: c.cpu.buzzAt - c.openedAt, correct, text: null });
}

function scoreAnswer(state, now, correct, text) {
  state.stats.attempted += 1;
  if (correct) state.stats.correct += 1;
  const c = state.clue;
  c.state = "resolved";
  c.result = { ...c.result, correct, text };
  c.nextAt = now + PRACTICE_TIMING.holdMs;
  emit(state, { type: "answered", correct, text });
}

const handlers = {
  start(state, { now }) { nextClue(state, now); },
  next(state, { now }) { nextClue(state, now); },

  tick(state, { now }) {
    const c = state.clue;
    if (!c) return;
    if (c.state === "reading" && now >= c.readingEndsAt) open(state, now);
    if (c.state === "open") {
      if (c.cpu.buzzAt !== null && now >= c.cpu.buzzAt) cpuWins(state, c.cpu.buzzAt);
      else if (now >= c.openedAt + TIMING.openWindowMs) resolve(state, now, { winner: null, reaction: null, correct: false, text: null });
    }
    if (c.state === "answering" && now >= c.deadline) scoreAnswer(state, now, false, "");
  },

  buzz(state, { now }) {
    const c = state.clue;
    if (!c) return;
    if (c.state === "reading") {
      // too early: locked out for a moment (the same rule as the game)
      if (now >= c.lockoutUntil) { c.lockoutUntil = now + TIMING.lockoutMs; state.stats.early += 1; emit(state, { type: "lockout" }); }
      return;
    }
    if (c.state !== "open" || now < c.lockoutUntil) return;
    const reaction = now - c.openedAt;
    // did the opponent beat you to it? (ties within tieMs go to you, as in the game)
    if (c.cpu.buzzAt !== null && c.cpu.buzzAt < now - TIMING.tieMs) { cpuWins(state, c.cpu.buzzAt); return; }
    if (state.mode === "answer") {
      c.state = "answering";
      c.deadline = now + TIMING.answerMs;
      c.result = { winner: "you", reaction, correct: null, text: null };
      state.stats.won += 1;
      state.stats.reactions.push(reaction);
      emit(state, { type: "won", reaction });
    } else {
      resolve(state, now, { winner: "you", reaction, correct: true, text: null });
    }
  },

  answer(state, { now, text }) {
    const c = state.clue;
    if (!c || c.state !== "answering") return;
    const source = state.clues[c.index];
    const verdict = matchAnswer(text, source);
    if (verdict.result === "borderline") {
      c.state = "ruling";
      c.pending = { text, matched: verdict.matched };
      emit(state, { type: "borderline", text });
      return;
    }
    scoreAnswer(state, now, verdict.result === "correct", text);
  },

  rule(state, { now, correct }) {
    const c = state.clue;
    if (!c || c.state !== "ruling") return;
    scoreAnswer(state, now, Boolean(correct), c.pending.text);
    c.pending = null;
  },
};

/** Applies one action ({ type, now, ... }). Mutates and returns state; state.lastEvents holds what happened. */
export function dispatchPractice(state, action) {
  state.lastEvents = [];
  const handler = handlers[action.type];
  if (handler) handler(state, action);
  return state;
}

/** Flattens a board's two rounds into practice clues (the Final is left out). */
export function cluesFromBoard(board) {
  const out = [];
  board.rounds.forEach((round) => round.categories.forEach((cat) => cat.clues.forEach((clue, row) => {
    out.push({ text: clue.text, answer: clue.answer, accept: clue.accept ?? [], strict: Boolean(clue.strict), category: cat.name, row, boardId: board.id });
  })));
  return out;
}
