# 61 - A Trivia Game

A single-player, phone-first quiz-show game from Longlight Interactive. You
stand at one of three podiums against two computer contestants and play a
full game in the classic format: two boards of six categories by five clues,
hidden doubles, and a wagered final. Buzz in real time, type your responses,
and handwrite your final answer. "61" is the number of clues in a full game.

**Play it:** https://jxstrr0.github.io/61/ (phase 1 of 8: the Home page only)

## How it is built

- Plain HTML, CSS and JavaScript with ES modules. No framework, no bundler,
  no build step. The browser loads `index.html`, which imports `src/main.js`.
- Hosted on GitHub Pages straight from `main` by `.github/workflows/deploy.yml`.
- The rules engine (`src/game.js`, arriving in phase 3) is a pure state
  machine with no DOM access, so every rule is unit-tested in Node.
- Boards are JSON files in `boards/`, generated with Claude outside the game,
  reviewed by hand, validated by the test suite and committed to the repo.
  No API key ships in the site and nothing is generated at runtime.
- Career stats and saves live in the browser's `localStorage`. There is no
  server and no database.

## Folder layout

```
index.html            # single page, all screens as <section>s, hash router
styles/
  tokens.css          # Longlight colours, type scale, spacing (copied from the hub)
  app.css
src/
  main.js             # boot, router, wires UI to engine
  game.js  cpu.js  match.js  rng.js  storage.js  audio.js   # phase 3
  ui/                 # board, clue, podiums, final, results, library, practice, tutorial, stats
boards/
  _schema.json        # JSON Schema for a board          (phase 2)
  index.json          # list of boards for the Library    (phase 2)
  <id>.json           # one file per board
data/opponents.json   # CPU roster                        (phase 6)
assets/               # fonts, logo, sound cues
tools/                # GENERATE_BOARD.md (the generation prompt), validate.js
test/                 # node --test suites
```

## Running the tests

```
npm test
```

That runs Node's built-in test runner (`node --test`). There is nothing to
install. The same command runs on every push and pull request
(`.github/workflows/test.yml`), and the deploy stops if it fails.

## Dependencies

None. Any new dependency needs a note here explaining why.

## Licence

© 2026 Longlight Interactive. Source visible for learning; all rights
reserved. Board content in `boards/` is licensed CC BY-NC 4.0. See
[LICENSE.md](LICENSE.md), which also lists third-party assets (the Space
Grotesk font, under the SIL Open Font License).
