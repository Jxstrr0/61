# Changelog

One line per build phase.

- **Phase 1** (2026-10-30): Scaffold and deploy. Repo layout, Home page saying "61", Longlight tokens and font, test and Pages workflows.
- **Phase 2** (2026-10-30): Board schema, validator (`node tools/validate.js`), board tests, generation prompt (`tools/GENERATE_BOARD.md`), first board General #1, `boards/index.json`.
- **Phase 3** (2026-10-30): Rules engine. Seeded RNG, fuzzy answer matching, CPU opponent model, DOM-free state machine (`src/game.js`), versioned storage, simulator and `debug.html`; 1,000 seeded games reconcile in the tests.
- **Phase 4** (2026-10-30): Board and clue UI. Quick Play, board grid with category reveal, clue card with go-light and tap/Space buzz, typed answers with a 10 s bar, borderline rulings, podiums with CPU speech bubbles, Daily Double wager stepper, round transitions. Playable through both rounds on a phone.
- **Phase 5** (2026-10-30): Final round (category, wager, 30 s handwritten response on a canvas, self-ruling, lowest-first reveals), results screen with score graph, category breakdown and missed clues, career stats recorded, autosave with Resume on the Home screen.
