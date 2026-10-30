# Changelog

One line per build phase.

- **Phase 1** (2026-10-30): Scaffold and deploy. Repo layout, Home page saying "61", Longlight tokens and font, test and Pages workflows.
- **Phase 2** (2026-10-30): Board schema, validator (`node tools/validate.js`), board tests, generation prompt (`tools/GENERATE_BOARD.md`), first board General #1, `boards/index.json`.
- **Phase 3** (2026-10-30): Rules engine. Seeded RNG, fuzzy answer matching, CPU opponent model, DOM-free state machine (`src/game.js`), versioned storage, simulator and `debug.html`; 1,000 seeded games reconcile in the tests.
- **Phase 4** (2026-10-30): Board and clue UI. Quick Play, board grid with category reveal, clue card with go-light and tap/Space buzz, typed answers with a 10 s bar, borderline rulings, podiums with CPU speech bubbles, Daily Double wager stepper, round transitions. Playable through both rounds on a phone.
- **Phase 5** (2026-10-30): Final round (category, wager, 30 s handwritten response on a canvas, self-ruling, lowest-first reveals), results screen with score graph, category breakdown and missed clues, career stats recorded, autosave with Resume on the Home screen.
- **Phase 6** (2026-10-30): Library with pack chips and board cards (played badge, best score), difficulty sheet with the two opponents previewed and a reroll, Stats screen (career tiles, category bars, reset with confirm), last difficulty remembered. Boards 2–5: General #2, General #3, Sports #1, Prairie #1.
- **Phase 7** (2026-10-30): Polish. Synthesized sound cues and Final loop with a mute toggle, four-card how-to shown once (and from Home), Practice mode (buzz only or buzz + type, reaction times and win rate against a Normal opponent), podium score count-ups, contrast fixes (clay tint for large text on purple, glow flashes), reduced-motion respected, web manifest and icons, results wordmark.
- **Phase 9** (2026-10-30): The studio. Night-studio redesign (dark set, amber stage light, glowing value cells, lecterns), an animated sun host with a speech balloon who reads clues, reacts to answers and greets you on Home (`src/host.js` + `assets/host/sun.svg`), a live set with moving beams, lamp truss, an on-air lamp, a lower-third banner, camera cuts, and an audience that applauds, groans and hushes for the Final (`assets/studio/audience.svg`). New icons and logo to match.
