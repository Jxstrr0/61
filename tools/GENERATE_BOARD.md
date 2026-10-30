# Generating a board

Boards are written with Claude outside the game (the Claude app on the Max
plan, or Claude Code), reviewed by hand, and committed to `boards/` as JSON.
Nothing is generated at runtime and no API key ever ships in the site.

## The prompt

Paste everything in the block below into Claude, followed by the contents of
`boards/_schema.json` and one existing board (for example
`boards/general-01.json`) as a worked example. Ask for one board at a time.

> You are writing a board for a quiz-show game in the classic format. Produce
> ONE board as JSON matching the schema in `boards/_schema.json`.
> Requirements: 6 categories per round, 5 clues each, difficulty rising with
> value (the 200 clue should be gettable by most adults, the 1000 clue by a
> strong trivia player). Clues are written as statements that point at a
> specific answer; answers are short nouns or names, not sentences. Category
> names may use wordplay; when they do, include a `note` explaining the
> gimmick. Mix topics: at least one each of history, science/nature,
> geography, arts/pop culture, sports, language/wordplay across the two
> rounds. Keep a Canadian/prairie flavour in roughly 1 in 6 categories but
> stay globally playable. Place Daily Doubles per the rules: exactly 1 in
> round 1 and 2 in round 2, never on the top row, never two in one category.
> For every answer, add 1–3 `accept` variants (nicknames, surname only,
> common misspellings). Mark `strict: true` where surname-only or partial
> credit would be wrong (two-name answers, numbers, years). The final clue
> should be hard, with a single unambiguous answer. Only output JSON. Avoid
> any clue about living people's private lives, and avoid copying any real
> broadcast clue you may remember.

Then tell it the board's `id` (lowercase slug, which is also the file name),
`title`, `pack` (General, Sports, Prairie, …) and `difficulty`
(easy / normal / hard).

## QA checklist before committing a board

1. Save it as `boards/<id>.json` and add a row to `boards/index.json`
   (id, title, pack, tags, difficulty, matching the file exactly).
2. Run `npm test`. It checks the schema, the values per row, Daily Double
   placement and repeated answers within the board, and that `index.json`
   matches the files on disk. `node tools/validate.js` prints the same
   checks for one file.
3. Skim every answer for facts you aren't sure of; spot-check 5 at random
   on the web. Fix or replace anything doubtful.
4. Make sure no two clues share an answer (the validator catches exact
   repeats; watch for near-repeats like "Paris" and "Paris, France").
5. Every wordplay category has a `note` that explains the gimmick.
6. Nothing in the board names the TV show, its host, or copies a broadcast
   clue.
7. Commit the board on its own, separate from code changes, so content
   review is easy. Boards are licensed CC BY-NC 4.0 (see LICENSE.md).

## Packs for v1

- General #1–#3 (normal)
- Sports (one board)
- Prairie (one board)

Later: packs by theme (Science, Movies, History, Markets) and difficulty tiers.
