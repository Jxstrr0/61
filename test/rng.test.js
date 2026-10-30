import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng, random, randomInt, gaussian, shuffle, pick } from "../src/rng.js";

test("same seed, same sequence", () => {
  const a = createRng(123), b = createRng(123);
  for (let i = 0; i < 100; i += 1) assert.equal(random(a), random(b));
});

test("different seeds differ", () => {
  assert.notEqual(random(createRng(1)), random(createRng(2)));
});

test("random stays in [0, 1) and randomInt within bounds", () => {
  const rng = createRng(7);
  for (let i = 0; i < 10000; i += 1) {
    const x = random(rng);
    assert.ok(x >= 0 && x < 1);
    const n = randomInt(rng, 3, 9);
    assert.ok(n >= 3 && n <= 9 && Number.isInteger(n));
  }
});

test("gaussian has roughly the right mean and spread", () => {
  const rng = createRng(99);
  let sum = 0, sq = 0;
  const N = 20000;
  for (let i = 0; i < N; i += 1) { const g = gaussian(rng, 600, 200); sum += g; sq += g * g; }
  const mean = sum / N;
  const sd = Math.sqrt(sq / N - mean * mean);
  assert.ok(Math.abs(mean - 600) < 10, `mean ${mean}`);
  assert.ok(Math.abs(sd - 200) < 10, `sd ${sd}`);
});

test("shuffle keeps every item and pick returns a member", () => {
  const rng = createRng(5);
  const list = [1, 2, 3, 4, 5, 6];
  const out = shuffle(rng, list);
  assert.deepEqual(out.slice().sort(), list);
  assert.ok(list.includes(pick(rng, list)));
});

test("the generator state is a plain serializable object", () => {
  const rng = createRng(42);
  random(rng);
  const copy = JSON.parse(JSON.stringify(rng));
  assert.equal(random(copy), random(rng));
});
