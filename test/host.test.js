// The host's lines are pure data-in, words-out: every event the engine logs
// in a full game gets a face the stylesheet knows, and the same seed gives
// the same lines twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hostReact, hostGreeting, HOST_MOODS } from "../src/host.js";
import { simulateGame } from "../src/sim.js";
import { emptyStats } from "../src/storage.js";

const board = JSON.parse(readFileSync(new URL("../boards/general-01.json", import.meta.url), "utf8"));
const roster = JSON.parse(readFileSync(new URL("../data/opponents.json", import.meta.url), "utf8")).opponents;

function linesForSeed(seed) {
  const { state } = simulateGame({ board, roster, seed });
  const out = [];
  for (const event of state.log) {
    const r = hostReact(event, state);
    if (r) out.push(r);
  }
  return out;
}

test("every reaction has a known mood and a string line", () => {
  const reactions = linesForSeed(7);
  assert.ok(reactions.length > 60, "the host speaks through a whole game");
  for (const r of reactions) {
    assert.ok(HOST_MOODS.includes(r.mood), `unknown mood ${r.mood}`);
    assert.equal(typeof r.text, "string");
    assert.ok(r.holdMs >= 0);
  }
});

test("the host covers the moments that matter", () => {
  const types = new Set();
  const { state } = simulateGame({ board, roster, seed: 3 });
  for (const event of state.log) if (hostReact(event, state)) types.add(event.type);
  for (const t of ["game.start", "round.start", "clue.select", "buzz", "score", "round.end", "final.clue", "game.end"]) {
    assert.ok(types.has(t), `reacts to ${t}`);
  }
});

test("a clue nobody got names the answer; a Daily Double is announced", () => {
  const { state } = simulateGame({ board, roster, seed: 11 });
  const nobody = state.log.find((e) => e.type === "clue.resolved" && !e.answered);
  if (nobody) assert.match(hostReact(nobody, state).text, /answer|Nobody|looking for/);
  const dd = state.log.find((e) => e.type === "clue.select" && e.dailyDouble);
  assert.ok(dd, "the simulated game hit a Daily Double");
  assert.match(hostReact(dd, state).text, /Daily Double/);
  assert.equal(hostReact(dd, state).mood, "surprised");
});

test("lines are deterministic for a seed and vary across a game", () => {
  const a = linesForSeed(5).map((r) => r.text);
  const b = linesForSeed(5).map((r) => r.text);
  assert.deepEqual(a, b);
  assert.ok(new Set(a).size > 10, "more than a handful of distinct lines");
});

test("the Home greeting changes with experience", () => {
  const fresh = hostGreeting(emptyStats());
  assert.match(fresh, /Welcome|Hello/);
  const veteran = hostGreeting({ ...emptyStats(), games: 12 }, 0);
  assert.notEqual(veteran, fresh);
});
