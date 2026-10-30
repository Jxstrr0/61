// The pure helpers behind the Library and Stats screens (the rendering
// itself needs a browser and is checked by hand / scripted play).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { packsOf, filterBoards, boardBadge } from "../src/ui/library.js";
import { statsRows, categoryRows, difficultyRows } from "../src/ui/stats.js";
import { createGame, previewOpponents } from "../src/game.js";
import { emptyStats, recordGame } from "../src/storage.js";

const index = JSON.parse(readFileSync(new URL("../boards/index.json", import.meta.url), "utf8"));
const board = JSON.parse(readFileSync(new URL("../boards/general-01.json", import.meta.url), "utf8"));
const roster = JSON.parse(readFileSync(new URL("../data/opponents.json", import.meta.url), "utf8")).opponents;

test("packs are listed once each, in index order, and filter the boards", () => {
  const packs = packsOf(index);
  assert.equal(new Set(packs).size, packs.length);
  assert.ok(packs.includes("General"));
  assert.equal(filterBoards(index.boards, "all").length, index.boards.length);
  for (const b of filterBoards(index.boards, "General")) assert.equal(b.pack, "General");
});

test("a board badge says New until it is played, then the plays and best score", () => {
  const entry = index.boards[0];
  assert.deepEqual(boardBadge(entry, {}), { text: "New", played: false });
  assert.equal(boardBadge(entry, { [entry.id]: { plays: 1, best: 1200, last: 0 } }).text, "Played once · best 1,200");
  assert.equal(boardBadge(entry, { [entry.id]: { plays: 3, best: -200, last: 0 } }).text, "Played 3× · best −200");
});

test("the difficulty sheet previews exactly the opponents the game then gets", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const seed of [1, 2, 3, 99]) {
      const preview = previewOpponents({ tags: board.tags, seed, difficulty, roster });
      const state = createGame({ board, seed, difficulty, roster });
      assert.deepEqual(state.contestants.slice(1).map((c) => c.id), preview.map((c) => c.id));
      assert.ok(preview.every((c) => c.pool === difficulty), `${difficulty}: both from the ${difficulty} pool`);
    }
  }
});

test("stats rows show dashes before any game and real numbers after one", () => {
  const empty = statsRows(emptyStats());
  assert.equal(empty.find((r) => r.label === "Best game").value, "—");
  assert.deepEqual(categoryRows(emptyStats()), []);
  assert.deepEqual(difficultyRows(emptyStats()), []);
  const stats = recordGame(emptyStats(), {
    playerWon: true, playerScore: 3400, difficulty: "hard",
    categories: { geography: { correct: 2, attempted: 3 }, science: { correct: 0, attempted: 1 } },
    buzz: { won: 4, lost: 2, averageReactionMs: 300 },
    dailyDouble: { correct: 1, attempted: 1 }, final: { correct: 0, attempted: 1 },
  });
  const rows = Object.fromEntries(statsRows(stats).map((r) => [r.label, r.value]));
  assert.equal(rows.Games, "1");
  assert.equal(rows.Wins, "1 (100 %)");
  assert.equal(rows["Best game"], "3,400");
  assert.equal(rows["Buzz races"], "67 % of 6");
  assert.equal(rows["Average buzz"], "300 ms");
  assert.deepEqual(categoryRows(stats).map((c) => c.tag), ["geography", "science"]);
  assert.deepEqual(difficultyRows(stats), [{ id: "hard", games: 1, wins: 1 }]);
});
