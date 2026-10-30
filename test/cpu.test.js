import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRng } from "../src/rng.js";
import * as cpu from "../src/cpu.js";

const roster = JSON.parse(readFileSync(new URL("../data/opponents.json", import.meta.url), "utf8")).opponents;

function contestant(pool, extra = {}) {
  return { profile: { ...cpu.POOLS[pool] }, strongTags: [], weakTags: [], ...extra };
}

const N = 10000;
const TOL = 0.02;

for (const pool of ["easy", "normal", "hard"]) {
  test(`${pool}: P(knows) at the top and bottom rows matches the table over ${N} rolls`, () => {
    const rng = createRng(1);
    const c = contestant(pool);
    let top = 0, bottom = 0;
    for (let i = 0; i < N; i += 1) {
      if (cpu.rollKnows(rng, c, 0, [])) top += 1;
      if (cpu.rollKnows(rng, c, 4, [])) bottom += 1;
    }
    assert.ok(Math.abs(top / N - cpu.POOLS[pool].knowsTop) < TOL, `top ${top / N}`);
    assert.ok(Math.abs(bottom / N - cpu.POOLS[pool].knowsBottom) < TOL, `bottom ${bottom / N}`);
  });

  test(`${pool}: reaction times centre on the mean with the right spread`, () => {
    const rng = createRng(2);
    const c = contestant(pool);
    let sum = 0, sq = 0;
    for (let i = 0; i < N; i += 1) { const r = cpu.rollReaction(rng, c); sum += r; sq += r * r; assert.ok(r >= cpu.MIN_REACTION_MS); }
    const mean = sum / N;
    const sd = Math.sqrt(sq / N - mean * mean);
    assert.ok(Math.abs(mean - cpu.POOLS[pool].reactionMean) < 15, `mean ${mean}`);
    assert.ok(Math.abs(sd - cpu.POOLS[pool].reactionSd) < 20, `sd ${sd}`);
  });

  test(`${pool}: wrong-buzz and final accuracy rates`, () => {
    const rng = createRng(3);
    const c = contestant(pool);
    let wrong = 0, final = 0;
    for (let i = 0; i < N; i += 1) {
      if (cpu.rollWrongBuzz(rng, c)) wrong += 1;
      if (cpu.rollFinalKnows(rng, c)) final += 1;
    }
    assert.ok(Math.abs(wrong / N - cpu.POOLS[pool].wrongBuzz) < 0.01, `wrong ${wrong / N}`);
    assert.ok(Math.abs(final / N - cpu.POOLS[pool].finalAccuracy) < TOL, `final ${final / N}`);
  });
}

test("knowledge falls smoothly down the rows and shifts with strong/weak tags", () => {
  const c = contestant("normal", { strongTags: ["science"], weakTags: ["sports"] });
  const rows = [0, 1, 2, 3, 4].map((r) => cpu.knowsProbability(c, r, []));
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i] < rows[i - 1]);
  assert.equal(rows[0], 0.75);
  assert.equal(rows[4], 0.45);
  assert.ok(Math.abs(cpu.knowsProbability(c, 2, ["science"]) - (0.6 + 0.15)) < 1e-9);
  assert.ok(Math.abs(cpu.knowsProbability(c, 2, ["sports"]) - (0.6 - 0.15)) < 1e-9);
});

test("Daily Double wagers respect the limits", () => {
  const rng = createRng(4);
  for (const pool of ["easy", "normal", "hard"]) {
    const c = contestant(pool);
    for (const [score, roundMax] of [[0, 1000], [-600, 2000], [3400, 1000], [50, 2000], [12000, 2000]]) {
      for (let i = 0; i < 200; i += 1) {
        const w = cpu.dailyDoubleWager(rng, c, score, roundMax);
        const { min, max } = cpu.dailyDoubleLimits(score, roundMax);
        assert.ok(w >= min && w <= max, `${pool} score ${score}: ${w} not in [${min}, ${max}]`);
        assert.ok(w % 100 === 0 || w === max, `${w} should be a round hundred`);
      }
    }
  }
  assert.deepEqual(cpu.dailyDoubleLimits(-400, 1000), { min: 5, max: 1000 }); // true Daily Double from the red
  assert.deepEqual(cpu.dailyDoubleLimits(2600, 2000), { min: 5, max: 2600 });
});

test("Final wagers: the leader covers second place, trailers go big, nobody overbets", () => {
  const rng = createRng(5);
  const c = contestant("normal");
  for (let i = 0; i < 200; i += 1) {
    const lead = cpu.finalWager(rng, c, [10000, 6000, 2000], 0);
    assert.ok(lead >= 2001 && lead <= 2001 + 500, `leader wager ${lead}`); // 2*6000+1-10000 = 2001, plus up to 5 % jitter
    const trail = cpu.finalWager(rng, c, [10000, 6000, 2000], 1);
    assert.ok(trail >= 4200 && trail <= 6000, `trailer wager ${trail}`);
    const runaway = cpu.finalWager(rng, c, [20000, 6000, 2000], 0);
    assert.ok(runaway >= 0 && runaway <= 1000, `runaway wager ${runaway}`);
  }
  assert.equal(cpu.finalWager(rng, c, [0, 5000, 1000], 0), 0);
  assert.equal(cpu.finalWager(rng, c, [-200, 5000, 1000], 0), 0);
});

test("pickOpponents takes two from the right pool with distinct strong and weak tags", () => {
  const rng = createRng(6);
  for (const difficulty of ["easy", "normal", "hard"]) {
    const [a, b] = cpu.pickOpponents(rng, roster, difficulty, ["history", "science", "sports"]);
    assert.equal(a.pool, difficulty);
    assert.equal(b.pool, difficulty);
    assert.notEqual(a.id, b.id);
    assert.equal(a.isHuman, false);
    assert.equal(a.strongTags.length, 1);
    assert.notEqual(a.strongTags[0], a.weakTags[0]);
    assert.equal(a.profile.knowsTop, cpu.POOLS[difficulty].knowsTop);
  }
});

test("the roster has at least two opponents per pool", () => {
  for (const pool of ["easy", "normal", "hard"]) {
    assert.ok(roster.filter((o) => o.pool === pool).length >= 2, pool);
  }
});
