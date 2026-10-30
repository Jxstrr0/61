import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as storage from "../src/storage.js";
import { createGame, dispatch, summarize } from "../src/game.js";
import { simulateGame } from "../src/sim.js";

const board = JSON.parse(readFileSync(new URL("../boards/general-01.json", import.meta.url), "utf8"));
const roster = JSON.parse(readFileSync(new URL("../data/opponents.json", import.meta.url), "utf8")).opponents;

test("a game saves on the board and loads back identical, and keeps replaying the same", () => {
  const store = storage.memoryStorage();
  const state = createGame({ board, roster, seed: 11, difficulty: "normal" });
  dispatch(state, { type: "start", now: 0 });
  assert.equal(storage.saveGame(state, store), true);
  const loaded = storage.loadGame(store);
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(state)));
  // the restored rng continues the same stream
  dispatch(state, { type: "select", clueId: "0-0-0", now: 100 });
  dispatch(loaded, { type: "select", clueId: "0-0-0", now: 100 });
  dispatch(state, { type: "tick", now: state.clue.readingEndsAt });
  dispatch(loaded, { type: "tick", now: loaded.clue.readingEndsAt });
  assert.deepEqual(loaded.clue.cpu, state.clue.cpu);
  storage.clearGame(store);
  assert.equal(storage.loadGame(store), null);
});

test("a game mid-clue is not saved", () => {
  const store = storage.memoryStorage();
  const state = createGame({ board, roster, seed: 11 });
  dispatch(state, { type: "start", now: 0 });
  dispatch(state, { type: "select", clueId: "0-0-0", now: 100 });
  assert.equal(storage.saveGame(state, store), false);
  assert.equal(storage.loadGame(store), null);
});

test("corrupt or missing entries read as empty", () => {
  const store = storage.memoryStorage();
  store.setItem(storage.KEYS.save, "{not json");
  store.setItem(storage.KEYS.stats, "[]");
  assert.equal(storage.loadGame(store), null);
  assert.deepEqual(storage.loadStats(store), storage.emptyStats());
  assert.deepEqual(storage.loadSettings(store), storage.defaultSettings());
  assert.deepEqual(storage.loadSettings(null), storage.defaultSettings()); // no storage at all
});

test("stats fold games in: record, winnings, streaks, categories, buzz, difficulty", () => {
  let stats = storage.emptyStats();
  const games = [1, 2, 3, 4, 5].map((seed) => simulateGame({ board, roster, seed, difficulty: "easy" }).summary);
  for (const summary of games) stats = storage.recordGame(stats, summary);
  assert.equal(stats.games, 5);
  assert.equal(stats.wins, games.filter((g) => g.playerWon).length);
  assert.equal(stats.totalWinnings, games.reduce((n, g) => n + Math.max(0, g.playerScore), 0));
  assert.equal(stats.bestGame, Math.max(...games.map((g) => g.playerScore)));
  assert.ok(stats.bestStreak >= stats.currentStreak);
  assert.equal(stats.byDifficulty.easy.games, 5);
  const attempted = Object.values(stats.categories).reduce((n, c) => n + c.attempted, 0);
  assert.equal(attempted, games.reduce((n, g) => n + Object.values(g.categories).reduce((m, c) => m + c.attempted, 0), 0));
  assert.equal(stats.buzz.won, games.reduce((n, g) => n + g.buzz.won, 0));
  // round-trips through storage
  const store = storage.memoryStorage();
  storage.saveStats(stats, store);
  assert.deepEqual(storage.loadStats(store), stats);
  storage.resetStats(store);
  assert.deepEqual(storage.loadStats(store), storage.emptyStats());
});

test("played boards track plays and best score", () => {
  const store = storage.memoryStorage();
  storage.markPlayed("general-01", 1200, store);
  storage.markPlayed("general-01", 800, store);
  const played = storage.loadPlayed(store);
  assert.equal(played["general-01"].plays, 2);
  assert.equal(played["general-01"].best, 1200);
});

test("settings and tutorial flag", () => {
  const store = storage.memoryStorage();
  storage.saveSettings({ ...storage.defaultSettings(), muted: true }, store);
  assert.equal(storage.loadSettings(store).muted, true);
  assert.equal(storage.tutorialSeen(store), false);
  storage.markTutorialSeen(store);
  assert.equal(storage.tutorialSeen(store), true);
});

test("summarize output is JSON-safe for saving", () => {
  const { summary } = simulateGame({ board, roster, seed: 9 });
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary);
});
