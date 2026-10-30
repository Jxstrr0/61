import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPractice, dispatchPractice, cluesFromBoard, averageReaction, winRate } from "../src/practice.js";
import { TIMING } from "../src/game.js";

const board = JSON.parse(readFileSync(new URL("../boards/general-01.json", import.meta.url), "utf8"));
const roster = JSON.parse(readFileSync(new URL("../data/opponents.json", import.meta.url), "utf8")).opponents;
const clues = cluesFromBoard(board);

test("a board flattens to 60 practice clues with rows 0–4", () => {
  assert.equal(clues.length, 60);
  assert.deepEqual([...new Set(clues.map((c) => c.row))].sort(), [0, 1, 2, 3, 4]);
});

test("buzzing before the light locks you out; a fast buzz after it wins the race", () => {
  const p = createPractice({ clues, seed: 5, mode: "buzz", roster });
  assert.equal(p.opponent.pool, "normal");
  dispatchPractice(p, { type: "start", now: 0 });
  assert.equal(p.clue.state, "reading");
  dispatchPractice(p, { type: "buzz", now: 10 });
  assert.equal(p.stats.early, 1);
  const openAt = p.clue.readingEndsAt;
  dispatchPractice(p, { type: "tick", now: openAt });
  assert.equal(p.clue.state, "open");
  // 40 ms after the light: no Normal opponent is that fast (MIN_REACTION is 120 ms)
  dispatchPractice(p, { type: "buzz", now: openAt + 40 });
  assert.equal(p.clue.state, "resolved");
  assert.equal(p.clue.result.winner, "you");
  assert.equal(p.clue.result.reaction, 40);
  assert.equal(p.stats.won, 1);
  assert.equal(averageReaction(p.stats), 40);
  assert.equal(winRate(p.stats), 1);
});

test("the lockout from an early buzz still applies just after the light", () => {
  const p = createPractice({ clues, seed: 5, mode: "buzz", roster });
  dispatchPractice(p, { type: "start", now: 0 });
  const openAt = p.clue.readingEndsAt;
  dispatchPractice(p, { type: "buzz", now: openAt - 100 }); // locked until openAt + 150
  dispatchPractice(p, { type: "tick", now: openAt });
  dispatchPractice(p, { type: "buzz", now: openAt + 50 });
  assert.equal(p.clue.state, "open", "still locked out");
  dispatchPractice(p, { type: "buzz", now: openAt + 160 });
  assert.equal(p.clue.result?.winner, "you");
});

test("over many clues the opponent wins some races and nobody-buzzes resolve on the window", () => {
  const p = createPractice({ clues, seed: 9, mode: "buzz", roster });
  dispatchPractice(p, { type: "start", now: 0 });
  let now = 0;
  let cpuWins = 0, nobody = 0;
  for (let i = 0; i < 120; i++) {
    const c = p.clue;
    now = c.readingEndsAt;
    dispatchPractice(p, { type: "tick", now });
    // the player is slow (700 ms) half the time, quick the other half
    const mine = now + (i % 2 ? 700 : 150);
    for (let t = now; t <= now + TIMING.openWindowMs + 1 && p.clue.state === "open"; t += 50) {
      dispatchPractice(p, { type: "tick", now: t });
      if (t >= mine && p.clue.state === "open") dispatchPractice(p, { type: "buzz", now: mine });
    }
    assert.equal(p.clue.state, "resolved", `clue ${i} resolved`);
    if (p.clue.result.winner === "cpu") cpuWins++;
    if (p.clue.result.winner === null) nobody++;
    now = p.clue.nextAt;
    dispatchPractice(p, { type: "next", now });
  }
  assert.ok(cpuWins > 10, `cpu won ${cpuWins}`);
  assert.equal(p.stats.seen, 121);
  assert.equal(p.stats.won + p.stats.lostRace + p.stats.unanswered, 120);
  void nobody;
});

test("answer mode: a typed response is matched, a borderline one asks for a ruling, the clock runs out as wrong", () => {
  const p = createPractice({ clues, seed: 3, mode: "answer", roster });
  dispatchPractice(p, { type: "start", now: 0 });
  const openAt = p.clue.readingEndsAt;
  dispatchPractice(p, { type: "tick", now: openAt });
  dispatchPractice(p, { type: "buzz", now: openAt + 30 });
  assert.equal(p.clue.state, "answering");
  dispatchPractice(p, { type: "answer", now: openAt + 2000, text: `what is ${p.clue.answer}` });
  assert.equal(p.clue.state, "resolved");
  assert.equal(p.clue.result.correct, true);
  assert.deepEqual([p.stats.correct, p.stats.attempted], [1, 1]);

  dispatchPractice(p, { type: "next", now: 20000 });
  const open2 = p.clue.readingEndsAt;
  dispatchPractice(p, { type: "tick", now: open2 });
  dispatchPractice(p, { type: "buzz", now: open2 + 30 });
  dispatchPractice(p, { type: "tick", now: open2 + 30 + TIMING.answerMs });
  assert.equal(p.clue.state, "resolved");
  assert.equal(p.clue.result.correct, false);
  assert.deepEqual([p.stats.correct, p.stats.attempted], [1, 2]);
});
