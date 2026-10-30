# 61 - A Trivia Game

A single-player, phone-first quiz-show game from Longlight Interactive. You
stand at one of three podiums against two computer contestants and play a
full game in the classic format: two boards of six categories by five clues,
hidden doubles, and a wagered final. Buzz in real time, type your responses,
and handwrite your final answer. "61" is the number of clues in a full game.

**Play it:** https://jxstrr0.github.io/61/ (phase 7 of 8: the full game with sound, tutorial, Practice mode and home-screen install; more boards and the launch are next)

## How it is built

- Plain HTML, CSS and JavaScript with ES modules. No framework, no bundler,
  no build step. The browser loads `index.html`, which imports `src/main.js`.
- Hosted on GitHub Pages straight from `main` by `.github/workflows/deploy.yml`
  (one-time setup: Settings → Pages → Source: GitHub Actions).
- The rules engine (`src/game.js`) is a state machine with no DOM access:
  every action carries a timestamp, every roll goes through a seeded random
  generator, so a board plus a seed replays identically and every rule is
  unit-tested in Node. `debug.html` runs a whole game in text.
- Boards are JSON files in `boards/`, generated with Claude outside the game,
  reviewed by hand, validated by the test suite and committed to the repo.
  No API key ships in the site and nothing is generated at runtime.
- Career stats and saves live in the browser's `localStorage`. There is no
  server and no database.
- Sound cues are synthesized with the Web Audio API (`src/audio.js`), so the
  site ships no audio files. The Final-round music is a short original loop
  made the same way. A mute toggle lives on the Home and game screens.
- `manifest.webmanifest` and the icons in `assets/icons/` let the game be
  added to a phone's home screen. There is no service worker yet, so it needs
  a connection to load.

## Folder layout

```
index.html            # single page, all screens as <section>s, hash router
styles/
  tokens.css          # Longlight colours, type scale, spacing (copied from the hub)
  app.css
src/
  main.js             # boot, router, wires UI to engine
  game.js             # state machine: rounds, clues, buzzer, wagers (pure, no DOM)
  cpu.js              # opponent profiles, knowledge + reaction rolls, wagering
  match.js            # normalize + fuzzy answer matching
  rng.js              # seeded random numbers (mulberry32)
  storage.js          # localStorage save/resume, stats, settings (versioned)
  sim.js              # plays a whole game with no UI (tests, debug.html)
  practice.js         # Practice mode rules: endless buzzer drill (pure, no DOM)
  audio.js            # Web Audio cues and the Final loop, mute
  ui/                 # board, clue, podiums, final, results, library, stats, practice, tutorial
boards/
  _schema.json        # JSON Schema for a board          (phase 2)
  index.json          # list of boards for the Library    (phase 2)
  <id>.json           # one file per board
data/opponents.json   # CPU roster: name, bio, pool
assets/               # fonts, logo.svg, icons/ (home-screen icons)
manifest.webmanifest  # install to home screen
tools/                # GENERATE_BOARD.md (the generation prompt), validate.js
test/                 # node --test suites
```

## Running the tests

```
npm test
```

That runs Node's built-in test runner (`node --test`). There is nothing to
install. The suite plays 1,000 seeded games through the engine and checks the
scores against the event log, runs a table of typed answers through the
matcher, checks the CPU dice over 10,000 rolls, and plays the Practice drill through its rules, and checks every board in
`boards/` against the schema and the placement rules (`node tools/validate.js` does the same for one file; see
`tools/GENERATE_BOARD.md` for how boards are written and reviewed). The same command runs on every push and pull request
(`.github/workflows/test.yml`), and the deploy stops if it fails.

## Dependencies

None. Any new dependency needs a note here explaining why.

## Licence

© 2026 Longlight Interactive. Source visible for learning; all rights
reserved. Board content in `boards/` is licensed CC BY-NC 4.0. See
[LICENSE.md](LICENSE.md), which also lists third-party assets (the Space
Grotesk font, under the SIL Open Font License).
