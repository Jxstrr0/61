// Phase 1 smoke test: proves the test runner and workflow are wired up.
// Real engine tests (game, match, cpu, boards) arrive in phases 2 and 3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenFromHash } from "../src/main.js";

test("router falls back to home for unknown or empty hashes", () => {
  assert.equal(screenFromHash(""), "home");
  assert.equal(screenFromHash("#"), "home");
  assert.equal(screenFromHash("#nope"), "home");
});

test("router reads known screens from the hash", () => {
  assert.equal(screenFromHash("#about"), "about");
  assert.equal(screenFromHash("#game?seed=42"), "game");
});
