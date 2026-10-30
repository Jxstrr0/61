// Board validator for 61 - A Trivia Game.
//
// Two layers:
//   1. Shape: the board is checked against boards/_schema.json with a small
//      JSON Schema interpreter (only the keywords the schema uses; no
//      packages). If the schema grows a keyword this file does not know,
//      the check fails loudly rather than silently passing.
//   2. Rules the schema cannot express: values per row, Daily Double
//      placement, no repeated answers, id matching the file name.
//
// Used by test/boards.test.js, and runnable by hand:
//   node tools/validate.js boards/general-01.json [more files...]
//   node tools/validate.js            (checks every board in boards/)

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BOARDS_DIR = resolve(HERE, "..", "boards");
export const SCHEMA = JSON.parse(readFileSync(join(BOARDS_DIR, "_schema.json"), "utf8"));

/** Row values for a round with the given multiplier (top row first). */
export const ROW_VALUES = [200, 400, 600, 800, 1000];
export const DAILY_DOUBLES_PER_ROUND = [1, 2];

// ---------------------------------------------------------------------------
// Layer 1: a tiny JSON Schema checker
// ---------------------------------------------------------------------------

const KNOWN_KEYWORDS = new Set([
  "$schema", "$id", "$ref", "$defs", "title", "description",
  "type", "required", "properties", "additionalProperties",
  "enum", "minLength", "minItems", "maxItems", "items", "pattern",
]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref: ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => node?.[key], root);
}

/** Pushes one error per problem found. `path` is a JSON-pointer-ish string for messages. */
function checkSchema(value, schema, path, root, errors) {
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(keyword)) {
      throw new Error(`_schema.json uses "${keyword}", which tools/validate.js does not implement`);
    }
  }
  if (schema.$ref) {
    checkSchema(value, resolveRef(schema.$ref, root), path, root, errors);
    return;
  }
  const actual = typeOf(value);
  if (schema.type) {
    const ok = schema.type === "number" ? (actual === "number" || actual === "integer") : actual === schema.type;
    if (!ok) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return; // further checks assume the right type
    }
  }
  if (schema.enum && !schema.enum.some((option) => option === value)) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }
  if (actual === "string") {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
      errors.push(`${path}: must not be empty`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
    }
  }
  if (actual === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} items, has ${value.length}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: allows at most ${schema.maxItems} items, has ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, i) => checkSchema(item, schema.items, `${path}[${i}]`, root, errors));
    }
  }
  if (actual === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required field "${key}"`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) {
        checkSchema(child, childSchema, `${path}.${key}`, root, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unknown field "${key}"`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 2: game rules
// ---------------------------------------------------------------------------

/** Lowercase, no accents or punctuation, single spaces. Mirrors src/match.js at a basic level. */
export function normalizeAnswer(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkRules(board, errors, { filename } = {}) {
  if (filename && board.id !== basename(filename, ".json")) {
    errors.push(`id "${board.id}" must equal the file name "${basename(filename, ".json")}"`);
  }

  const seenAnswers = new Map(); // normalized answer -> where it was first used

  function noteAnswer(answer, where) {
    const key = normalizeAnswer(answer);
    if (seenAnswers.has(key)) {
      errors.push(`${where}: answer "${answer}" is already used at ${seenAnswers.get(key)}`);
    } else {
      seenAnswers.set(key, where);
    }
  }

  board.rounds?.forEach((round, r) => {
    const roundPath = `rounds[${r}] (${round.name})`;
    if (round.multiplier !== r + 1) {
      errors.push(`${roundPath}: multiplier must be ${r + 1}`);
    }
    const names = new Set();
    let dailyDoubles = 0;
    round.categories?.forEach((category, c) => {
      const catPath = `${roundPath} category ${c + 1} "${category.name}"`;
      const name = normalizeAnswer(category.name);
      if (names.has(name)) errors.push(`${catPath}: duplicate category name in this round`);
      names.add(name);

      let ddInCategory = 0;
      category.clues?.forEach((clue, i) => {
        const cluePath = `${catPath} clue ${i + 1}`;
        const expected = ROW_VALUES[i] * round.multiplier;
        if (clue.value !== expected) {
          errors.push(`${cluePath}: value must be ${expected} (row ${i + 1} of round ${r + 1}), got ${clue.value}`);
        }
        if (clue.dailyDouble) {
          dailyDoubles += 1;
          ddInCategory += 1;
          if (i === 0) errors.push(`${cluePath}: a Daily Double may not sit on the top row`);
        }
        if (clue.answer) noteAnswer(clue.answer, cluePath);
      });
      if (ddInCategory > 1) errors.push(`${catPath}: has ${ddInCategory} Daily Doubles; at most 1 per category`);
    });
    const wanted = DAILY_DOUBLES_PER_ROUND[r];
    if (dailyDoubles !== wanted) {
      errors.push(`${roundPath}: needs exactly ${wanted} Daily Double${wanted === 1 ? "" : "s"}, has ${dailyDoubles}`);
    }
  });

  if (board.final?.answer) noteAnswer(board.final.answer, "final");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates one board object. Returns an array of error messages; an empty
 * array means the board is good. Pass { filename } to also check the id.
 */
export function validateBoard(board, options = {}) {
  const errors = [];
  checkSchema(board, SCHEMA, "board", SCHEMA, errors);
  if (errors.length === 0) checkRules(board, errors, options);
  return errors;
}

/** Reads and validates one board file. Returns { board, errors }. */
export function validateBoardFile(filename) {
  let board;
  try {
    board = JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    return { board: null, errors: [`${filename}: not valid JSON (${error.message})`] };
  }
  return { board, errors: validateBoard(board, { filename }) };
}

/** Every playable board file in boards/ (not _schema.json or index.json). */
export function listBoardFiles(dir = BOARDS_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_") && name !== "index.json")
    .sort()
    .map((name) => join(dir, name));
}

// Command line: node tools/validate.js [files...]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : listBoardFiles();
  let failed = 0;
  for (const file of files) {
    const { errors } = validateBoardFile(file);
    if (errors.length === 0) {
      console.log(`ok    ${file}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${file}`);
      for (const error of errors) console.log(`      - ${error}`);
    }
  }
  console.log(`${files.length - failed} of ${files.length} board(s) valid`);
  process.exit(failed ? 1 : 0);
}
