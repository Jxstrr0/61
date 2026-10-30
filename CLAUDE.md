# Notes for Claude

61 - A Trivia Game, a phone-first quiz-show game by Longlight Interactive.
Live at https://jxstrr0.github.io/61/ (deployed from `main` by
`.github/workflows/deploy.yml`).

## The build plan

The plan of record is the Claude Doc "61 - A Trivia Game — Build Plan"
(https://claude.ai/artifact/FQnGDVP7y6YKr7DYGRDZLo). It fixes the v1
decisions, the rules engine, the board schema, the screens and eight build
phases. Start every session by reading it and the phase number you are on.
Do not reopen the decisions log; propose changes to it in chat instead.
CHANGELOG.md says which phases are done.

## Working agreements (from the plan)

- Engine stays DOM-free; UI modules never compute rules. A rule question is
  answered in `src/game.js` and covered by a test.
- Static only: plain HTML, CSS, vanilla JS with ES modules, no build step.
  No new dependencies without a note in README.md explaining why. Any
  third-party asset gets a row in LICENSE.md with source and licence.
- Every phase ends with `npm test` green and the work on `main`.
- Commit boards separately from code so content review is easy.
- One line per phase in CHANGELOG.md.
- No secrets: the repo is public and no API key may ship in the site.
- Phone first (works at 360 px wide, one thumb), desktop supported.
  Relative paths only (`./src/main.js`), because the site lives under `/61/`.
- Kelbo is a beginner-plus coder, mostly on his phone. Keep code readable,
  comment anything non-obvious, and explain changes in plain language.
- The site uses the name Kelbo and the studio name Longlight Interactive only.
  Never put a real name or initials anywhere in the repo.

## Authorship

- Commits: author and committer are `Jxstrr0
  <322161611+Jxstrr0@users.noreply.github.com>`, and every commit message
  ends with the `Co-Authored-By: Claude` and `Claude-Session:` lines the
  session supplies. Never use the account's real email address.
- Pull requests: opened through the GitHub connector (which acts as Jxstrr0)
  and keep the "Generated with Claude Code" footer in the description.
- PR #1 was a one-off exception with no Claude attribution. Don't repeat it
  unless Kelbo asks again.

## IP boundaries

Never use the name "Jeopardy!", its logo, the trademarked blue-board look,
the think music, or host and contestant likenesses. The mechanics (board of
values, answer-as-question, hidden doubles, wagered final) are fine. The
README calls it a "quiz-show game" without naming the show.
