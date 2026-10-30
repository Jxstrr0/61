// Every board in boards/ must pass the validator, index.json must list
// exactly those boards, and the validator must reject broken boards with a
// message that says what is wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { BOARDS_DIR, listBoardFiles, validateBoard, validateBoardFile } from "../tools/validate.js";

const files = listBoardFiles();
const index = JSON.parse(readFileSync(join(BOARDS_DIR, "index.json"), "utf8"));

test("there is at least one board", () => {
  assert.ok(files.length >= 1);
});

for (const file of files) {
  test(`${basename(file)} is a valid board`, () => {
    const { errors } = validateBoardFile(file);
    assert.deepEqual(errors, []);
  });
}

test("board ids are unique", () => {
  const ids = files.map((file) => JSON.parse(readFileSync(file, "utf8")).id);
  assert.equal(new Set(ids).size, ids.length);
});

test("index.json lists every board once, with matching title, pack, tags and difficulty", () => {
  assert.ok(Array.isArray(index.boards), "index.json has a boards array");
  const listed = index.boards.map((entry) => entry.id).sort();
  const onDisk = files.map((file) => basename(file, ".json")).sort();
  assert.deepEqual(listed, onDisk);
  for (const entry of index.boards) {
    const board = JSON.parse(readFileSync(join(BOARDS_DIR, `${entry.id}.json`), "utf8"));
    assert.equal(entry.title, board.title, `${entry.id}: title`);
    assert.equal(entry.pack, board.pack, `${entry.id}: pack`);
    assert.equal(entry.difficulty, board.difficulty, `${entry.id}: difficulty`);
    assert.deepEqual(entry.tags, board.tags, `${entry.id}: tags`);
  }
});

// ---- The validator catches broken boards with clear messages ----

function freshBoard() {
  return JSON.parse(readFileSync(files[0], "utf8"));
}

function errorsFor(mutate) {
  const board = freshBoard();
  mutate(board);
  return validateBoard(board);
}

test("rejects a missing field", () => {
  const errors = errorsFor((b) => delete b.final);
  assert.match(errors.join("\n"), /missing required field "final"/);
});

test("rejects an unknown field", () => {
  const errors = errorsFor((b) => { b.rounds[0].categories[0].clues[0].hint = "x"; });
  assert.match(errors.join("\n"), /unknown field "hint"/);
});

test("rejects the wrong number of categories", () => {
  const errors = errorsFor((b) => b.rounds[1].categories.pop());
  assert.match(errors.join("\n"), /needs at least 6 items, has 5/);
});

test("rejects a wrong value for its row", () => {
  const errors = errorsFor((b) => { b.rounds[1].categories[2].clues[1].value = 600; });
  assert.match(errors.join("\n"), /value must be 800 \(row 2 of round 2\), got 600/);
});

test("rejects a Daily Double on the top row", () => {
  const errors = errorsFor((b) => {
    for (const cat of b.rounds[0].categories) for (const clue of cat.clues) clue.dailyDouble = false;
    b.rounds[0].categories[3].clues[0].dailyDouble = true;
  });
  assert.match(errors.join("\n"), /may not sit on the top row/);
});

test("rejects the wrong Daily Double count", () => {
  const errors = errorsFor((b) => {
    for (const cat of b.rounds[0].categories) for (const clue of cat.clues) clue.dailyDouble = false;
  });
  assert.match(errors.join("\n"), /needs exactly 1 Daily Double, has 0/);
});

test("rejects two Daily Doubles in one category", () => {
  const errors = errorsFor((b) => {
    for (const cat of b.rounds[1].categories) for (const clue of cat.clues) clue.dailyDouble = false;
    b.rounds[1].categories[0].clues[2].dailyDouble = true;
    b.rounds[1].categories[0].clues[4].dailyDouble = true;
  });
  assert.match(errors.join("\n"), /at most 1 per category/);
});

test("rejects a repeated answer, ignoring case and punctuation", () => {
  const errors = errorsFor((b) => {
    b.rounds[1].categories[1].clues[1].answer = b.rounds[0].categories[0].clues[0].answer.toUpperCase() + "!";
  });
  assert.match(errors.join("\n"), /is already used at/);
});

test("rejects an empty answer", () => {
  const errors = errorsFor((b) => { b.rounds[0].categories[1].clues[3].answer = "   "; });
  assert.match(errors.join("\n"), /answer: must not be empty/);
});

test("rejects an id that does not match the file name", () => {
  const board = freshBoard();
  const errors = validateBoard(board, { filename: "boards/other-name.json" });
  assert.match(errors.join("\n"), /must equal the file name "other-name"/);
});

test("rejects an unknown difficulty", () => {
  const errors = errorsFor((b) => { b.difficulty = "brutal"; });
  assert.match(errors.join("\n"), /difficulty: must be one of/);
});
