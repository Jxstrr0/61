import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGame, dispatch, readingDelay, TIMING, findClue, chooseClueForCpu, clueId, summarize } from "../src/game.js";
import { simulateGame } from "../src/sim.js";
import { validateBoard } from "../tools/validate.js";

const board = JSON.parse(readFileSync(new URL("../boards/general-01.json", import.meta.url), "utf8"));
const roster = JSON.parse(readFileSync(new URL("../data/opponents.json", import.meta.url), "utf8")).opponents;
assert.deepEqual(validateBoard(board), []);

// ---------- Simulated games ----------

const SIM_GAMES = 1000;

test(`${SIM_GAMES} seeded games complete with scores that reconcile against the event log`, () => {
  let humanWins = 0;
  for (let seed = 1; seed <= SIM_GAMES; seed += 1) {
    const difficulty = ["easy", "normal", "hard"][seed % 3];
    const { state, summary, scoresFromLog } = simulateGame({ board, roster, seed, difficulty });
    assert.equal(state.phase, "results", `seed ${seed}`);
    assert.deepEqual(state.contestants.map((c) => c.score), scoresFromLog, `seed ${seed}: running totals vs log`);
    assert.deepEqual(summary.scores, scoresFromLog);
    // every clue played exactly once
    assert.equal(Object.keys(state.used).length, 60, `seed ${seed}: clues used`);
    assert.equal(state.log.filter((e) => e.type === "clue.resolved").length, 60);
    // Daily Doubles: 1 in round 1, 2 in round 2
    const dd = state.log.filter((e) => e.type === "dd.wager");
    assert.equal(dd.length, 3, `seed ${seed}: daily doubles`);
    assert.equal(dd.filter((e) => e.clueId.startsWith("0-")).length, 1);
    // nobody answers the same clue twice
    const seen = new Set();
    for (const e of state.log) if (e.type === "score" && e.kind !== "final") {
      const key = `${e.clueId}:${e.contestant}`;
      assert.ok(!seen.has(key), `seed ${seed}: ${key} answered twice`);
      seen.add(key);
    }
    // Final eligibility: only positive scores play and wager within their score
    const entry = state.final.entryScores;
    for (const e of state.log) if (e.type === "final.wager") {
      assert.ok(entry[e.contestant] > 0, `seed ${seed}: ineligible contestant wagered`);
      assert.ok(e.amount >= 0 && e.amount <= entry[e.contestant], `seed ${seed}: final wager out of range`);
    }
    for (const [i, s] of entry.entries()) {
      if (s <= 0) assert.ok(!state.final.revealed.includes(i), `seed ${seed}: contestant ${i} sat out`);
      else assert.ok(state.final.revealed.includes(i), `seed ${seed}: contestant ${i} was revealed`);
    }
    if (summary.playerWon) humanWins += 1;
  }
  // a Normal stand-in human should win a fair share, not everything and not nothing
  const rate = humanWins / SIM_GAMES;
  assert.ok(rate > 0.15 && rate < 0.85, `human win rate ${rate}`);
});

test("the same seed replays the same log", () => {
  const a = simulateGame({ board, roster, seed: 77, difficulty: "hard" });
  const b = simulateGame({ board, roster, seed: 77, difficulty: "hard" });
  assert.deepEqual(a.log, b.log);
  const c = simulateGame({ board, roster, seed: 78, difficulty: "hard" });
  assert.notDeepEqual(a.log, c.log);
});

test("difficulty shows in the results: Hard opponents score more than Easy ones on average", () => {
  const avg = (difficulty) => {
    let total = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const { summary } = simulateGame({ board, roster, seed, difficulty });
      total += summary.scores[1] + summary.scores[2];
    }
    return total / 150;
  };
  assert.ok(avg("hard") > avg("normal") && avg("normal") > avg("easy"));
});

// ---------- Scripted scenarios ----------

function fresh(seed = 1) {
  const state = createGame({ board, roster, seed, difficulty: "normal" });
  dispatch(state, { type: "start", now: 0 });
  return state;
}

/** Selects a clue and ticks to the go-light, with every CPU silenced so the human is alone. */
function openClueAlone(state, id, now = 1000) {
  dispatch(state, { type: "select", clueId: id, now });
  dispatch(state, { type: "tick", now: state.clue.readingEndsAt });
  for (const plan of Object.values(state.clue.cpu)) { plan.buzzes = false; plan.buzzAt = null; }
  return state.clue.openedAt;
}

test("reading delay is clamped between 1.5 s and 6 s at 250 ms a word", () => {
  assert.equal(readingDelay("one two"), 1500);
  assert.equal(readingDelay(new Array(10).fill("w").join(" ")), 2500);
  assert.equal(readingDelay(new Array(40).fill("w").join(" ")), 6000);
});

test("the human picks first in round 1 and a clue moves the game to the reading state", () => {
  const state = fresh();
  assert.equal(state.phase, "board");
  assert.equal(state.controller, 0);
  dispatch(state, { type: "select", clueId: "0-0-0", now: 1000 });
  assert.equal(state.phase, "clue");
  assert.equal(state.clue.state, "reading");
  assert.equal(state.clue.readingEndsAt, 1000 + readingDelay(board.rounds[0].categories[0].clues[0].text));
});

test("buzzing during the reading locks the human out for 250 ms", () => {
  const state = fresh();
  dispatch(state, { type: "select", clueId: "0-0-0", now: 1000 });
  const t = state.clue.readingEndsAt - 100;
  dispatch(state, { type: "buzz", now: t });
  assert.equal(state.lastEvents[0].type, "lockout");
  assert.equal(state.clue.lockoutUntil, t + TIMING.lockoutMs);
  dispatch(state, { type: "tick", now: state.clue.readingEndsAt });
  for (const plan of Object.values(state.clue.cpu)) { plan.buzzes = false; plan.buzzAt = null; }
  // still locked out 50 ms after the go-light
  dispatch(state, { type: "buzz", now: state.clue.readingEndsAt + 50 });
  assert.equal(state.lastEvents[0].type, "ignored");
  // free again after the lockout
  dispatch(state, { type: "buzz", now: t + TIMING.lockoutMs + 1 });
  assert.equal(state.clue.state, "answering");
  assert.equal(state.clue.answerer, 0);
});

test("a correct typed answer adds the value and hands over control; a wrong one deducts it", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-0-0");
  dispatch(state, { type: "buzz", now: opened + 400 });
  dispatch(state, { type: "answer", text: "What is Paris?", now: opened + 2000 });
  assert.equal(state.contestants[0].score, 200);
  assert.equal(state.clue.state, "resolved");
  assert.equal(state.controller, 0);
  dispatch(state, { type: "next", now: opened + 3000 });
  assert.equal(state.phase, "board");

  const opened2 = openClueAlone(state, "0-0-1", opened + 4000);
  dispatch(state, { type: "buzz", now: opened2 + 400 });
  dispatch(state, { type: "answer", text: "New Zealand", now: opened2 + 2000 });
  assert.equal(state.contestants[0].score, 200 - 400);
  // nobody else will buzz: the clue resolves unanswered and control stays put
  dispatch(state, { type: "tick", now: opened2 + 2000 + TIMING.reboundWindowMs });
  assert.equal(state.clue.state, "resolved");
  assert.equal(state.controller, 0);
});

test("a wrong answer reopens the buzzers for the others for 3 s", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-1-0");
  dispatch(state, { type: "buzz", now: opened + 300 });
  dispatch(state, { type: "answer", text: "arm", now: opened + 1000 });
  assert.equal(state.clue.state, "open");
  assert.equal(state.clue.windowEndsAt, opened + 1000 + TIMING.reboundWindowMs);
  assert.deepEqual(state.clue.attempted, [0]);
  // the human cannot buzz again on this clue
  dispatch(state, { type: "buzz", now: opened + 1100 });
  assert.equal(state.lastEvents[0].type, "ignored");
  // a CPU that knows it takes the rebound
  state.clue.cpu[1] = { knows: true, buzzes: true, buzzAt: opened + 1500 };
  dispatch(state, { type: "tick", now: opened + 1600 });
  assert.equal(state.clue.answerer, 1);
  dispatch(state, { type: "tick", now: opened + 1500 + TIMING.cpuAnswerMs });
  assert.equal(state.contestants[1].score, 200);
  assert.equal(state.controller, 1);
});

test("the earliest buzz wins and ties within 15 ms go to the human", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-2-0");
  state.clue.cpu[2] = { knows: true, buzzes: true, buzzAt: opened + 500 };
  // human 10 ms behind: tie, human wins
  dispatch(state, { type: "buzz", now: opened + 510 });
  assert.equal(state.clue.answerer, 0);

  const state2 = fresh();
  const opened2 = openClueAlone(state2, "0-2-0");
  state2.clue.cpu[2] = { knows: true, buzzes: true, buzzAt: opened2 + 500 };
  // human 20 ms behind: CPU wins, the buzz is logged as lost
  dispatch(state2, { type: "buzz", now: opened2 + 520 });
  assert.equal(state2.clue.answerer, 2);
  assert.ok(state2.lastEvents.some((e) => e.type === "buzz.lost" && e.contestant === 0));
});

test("no buzz at all: the clue resolves after the 5 s window and control stays", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-3-0");
  dispatch(state, { type: "tick", now: opened + TIMING.openWindowMs });
  assert.equal(state.clue.state, "resolved");
  assert.equal(state.lastEvents.at(-1).noBuzz, true);
  assert.equal(state.controller, 0);
});

test("running out the 10 s answer timer counts as wrong", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-3-0");
  dispatch(state, { type: "buzz", now: opened + 300 });
  dispatch(state, { type: "tick", now: opened + 300 + TIMING.answerMs });
  assert.equal(state.contestants[0].score, -200);
});

test("a borderline answer waits for the player's ruling", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-0-0"); // Paris
  dispatch(state, { type: "buzz", now: opened + 300 });
  dispatch(state, { type: "answer", text: "Prs", now: opened + 1000 });
  assert.equal(state.clue.state, "ruling");
  dispatch(state, { type: "rule", correct: true, now: opened + 2000 });
  assert.equal(state.contestants[0].score, 200);
});

test("the phrasing nudge fires once per round", () => {
  const state = fresh();
  const opened = openClueAlone(state, "0-0-0");
  dispatch(state, { type: "buzz", now: opened + 300 });
  dispatch(state, { type: "answer", text: "Paris", now: opened + 1000 });
  assert.ok(state.lastEvents.some((e) => e.type === "nudge"));
  dispatch(state, { type: "next", now: opened + 2000 });
  const opened2 = openClueAlone(state, "0-0-1", opened + 3000);
  dispatch(state, { type: "buzz", now: opened2 + 300 });
  dispatch(state, { type: "answer", text: "Australia", now: opened2 + 1000 });
  assert.ok(!state.lastEvents.some((e) => e.type === "nudge"));
});

test("Daily Double: the picker wagers alone within the limits, then answers with no buzz race", () => {
  const state = fresh();
  // the round 1 Daily Double is in THE HUMAN BODY at 800 (0-1-3)
  assert.equal(board.rounds[0].categories[1].clues[3].dailyDouble, true);
  dispatch(state, { type: "select", clueId: "0-1-3", now: 1000 });
  assert.equal(state.clue.state, "wager");
  dispatch(state, { type: "wager", amount: 4, now: 1100 });
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "wager", amount: 1001, now: 1100 });
  assert.equal(state.lastEvents[0].type, "ignored"); // score 0 -> max is the round's 1000
  dispatch(state, { type: "wager", amount: 1000, now: 1100 });
  assert.equal(state.clue.state, "reading");
  dispatch(state, { type: "tick", now: state.clue.readingEndsAt });
  assert.equal(state.clue.state, "answering");
  assert.equal(state.clue.answerer, 0);
  dispatch(state, { type: "buzz", now: state.clue.readingEndsAt + 10 });
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "answer", text: "thyroid", now: state.clue.readingEndsAt + 2000 });
  assert.equal(state.contestants[0].score, 1000);
  assert.equal(state.clue.state, "resolved");
});

test("a wrong Daily Double is not offered to the others", () => {
  const state = fresh();
  dispatch(state, { type: "select", clueId: "0-1-3", now: 1000 });
  dispatch(state, { type: "wager", amount: 600, now: 1100 });
  dispatch(state, { type: "tick", now: state.clue.readingEndsAt });
  dispatch(state, { type: "answer", text: "pancreas", now: state.clue.readingEndsAt + 1000 });
  assert.equal(state.contestants[0].score, -600);
  assert.equal(state.clue.state, "resolved");
});

test("a CPU controller picks the top remaining clue of some category", () => {
  const state = fresh();
  state.used["0-0-0"] = true;
  for (let i = 0; i < 20; i += 1) {
    const id = chooseClueForCpu(state);
    const info = findClue(board, id);
    assert.ok(!state.used[id]);
    if (info.catIndex === 0) assert.equal(info.row, 1);
    else assert.equal(info.row, 0);
  }
});

test("round 2 opens with the lowest score in control; after round 2 comes the Final", () => {
  const state = fresh();
  // play round 1 out instantly: mark everything used except one clue, resolve it unanswered
  for (let c = 0; c < 6; c += 1) for (let r = 0; r < 5; r += 1) if (!(c === 5 && r === 4)) state.used[clueId(0, c, r)] = true;
  state.contestants[0].score = 1000;
  state.contestants[1].score = -400;
  state.contestants[2].score = 600;
  const opened = openClueAlone(state, "0-5-4");
  dispatch(state, { type: "tick", now: opened + TIMING.openWindowMs });
  dispatch(state, { type: "next", now: opened + 6000 });
  assert.equal(state.phase, "roundEnd");
  dispatch(state, { type: "next", now: opened + 7000 });
  assert.equal(state.phase, "board");
  assert.equal(state.round, 1);
  assert.equal(state.controller, 1);
});

test("Final: negative scores sit out, wagers are bounded, reveals go lowest first, ties share the win", () => {
  const state = fresh();
  for (let c = 0; c < 6; c += 1) for (let r = 0; r < 5; r += 1) { state.used[clueId(0, c, r)] = true; state.used[clueId(1, c, r)] = true; }
  delete state.used["1-5-4"];
  state.round = 1;
  state.contestants[0].score = 2000;
  state.contestants[1].score = -800;
  state.contestants[2].score = 3000;
  const opened = openClueAlone(state, "1-5-4", 1000);
  dispatch(state, { type: "tick", now: opened + TIMING.openWindowMs });
  dispatch(state, { type: "next", now: opened + 6000 });
  dispatch(state, { type: "next", now: opened + 7000 });
  assert.equal(state.phase, "final");
  assert.deepEqual(state.final.eligible, [0, 2]);
  assert.deepEqual(state.final.revealOrder, [0, 2]);
  dispatch(state, { type: "next", now: opened + 8000 }); // category -> wager (CPU wagers now)
  assert.equal(state.final.stage, "wager");
  assert.ok(2 in state.final.wagers);
  dispatch(state, { type: "next", now: opened + 8100 });
  assert.equal(state.lastEvents[0].type, "ignored"); // the player has not wagered
  dispatch(state, { type: "finalWager", amount: 2001, now: opened + 8200 });
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "finalWager", amount: 2000, now: opened + 8200 });
  dispatch(state, { type: "next", now: opened + 8300 });
  assert.equal(state.final.stage, "clue");
  dispatch(state, { type: "tick", now: state.final.thinkEndsAt }); // time runs out
  assert.equal(state.final.stage, "ruling");
  dispatch(state, { type: "finalRule", correct: true, now: opened + 40000 });
  assert.equal(state.final.stage, "reveal");
  // force the CPU's outcome so the test is deterministic: wrong, wagering everything it needs to tie
  state.final.knows[2] = true;
  state.final.wagers[2] = 1000;
  dispatch(state, { type: "next", now: opened + 41000 });
  assert.deepEqual(state.final.revealed, [0]);
  assert.equal(state.contestants[0].score, 4000);
  dispatch(state, { type: "next", now: opened + 42000 });
  assert.equal(state.phase, "results");
  assert.equal(state.contestants[2].score, 4000);
  assert.deepEqual(state.winners, [0, 2]);
  const summary = summarize(state);
  assert.equal(summary.playerWon, true);
  assert.equal(state.contestants[1].score, -800);
});

test("if nobody has a positive score the Final is skipped", () => {
  const state = fresh();
  for (let c = 0; c < 6; c += 1) for (let r = 0; r < 5; r += 1) { state.used[clueId(0, c, r)] = true; state.used[clueId(1, c, r)] = true; }
  delete state.used["1-0-0"];
  state.round = 1;
  state.contestants.forEach((c) => { c.score = -100; });
  const opened = openClueAlone(state, "1-0-0", 1000);
  dispatch(state, { type: "tick", now: opened + TIMING.openWindowMs });
  dispatch(state, { type: "next", now: opened + 6000 });
  dispatch(state, { type: "next", now: opened + 7000 });
  assert.equal(state.phase, "results");
});

test("illegal actions are ignored and recorded, never thrown", () => {
  const state = fresh();
  dispatch(state, { type: "buzz", now: 1 });
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "answer", text: "x", now: 1 });
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "select", clueId: "1-0-0", now: 1 }); // wrong round
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "nonsense", now: 1 });
  assert.equal(state.lastEvents[0].type, "ignored");
  dispatch(state, { type: "tick" });
  assert.equal(state.lastEvents[0].type, "ignored");
  assert.equal(state.phase, "board");
});

test("summarize reports per-tag accuracy, missed clues and the score series", () => {
  const { summary, state } = simulateGame({ board, roster, seed: 3, difficulty: "normal" });
  assert.equal(summary.series[0].length, 61); // start + 60 clues
  assert.equal(summary.series.length, 3);
  const attempted = Object.values(summary.categories).reduce((n, c) => n + c.attempted, 0);
  assert.ok(attempted > 0);
  const myClueAnswers = state.log.filter((e) => e.type === "score" && e.contestant === 0 && e.kind !== "final");
  const myCorrect = myClueAnswers.filter((e) => e.correct).length;
  assert.equal(summary.missed.length, 60 - myCorrect);
  assert.ok(summary.buzz.won > 0);
});
