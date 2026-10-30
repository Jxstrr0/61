// The Library: pack chips to filter, then one card per board with its
// played/unplayed badge and your best score. Tapping a card opens the
// difficulty sheet (also here), which previews the two opponents the game
// would pick and starts the game.

import { escapeHtml, formatScore } from "./podiums.js";

export const DIFFICULTIES = [
  { id: "easy", label: "Easy", blurb: "Slow buzzers who miss the hard rows. Good for learning the rhythm." },
  { id: "normal", label: "Normal", blurb: "Pub-quiz regulars. A fair fight." },
  { id: "hard", label: "Hard", blurb: "Champions. They buzz fast and know the bottom row." },
];

/** The packs in the index, in the order they first appear. */
export function packsOf(index) {
  const seen = [];
  for (const b of index.boards) if (!seen.includes(b.pack)) seen.push(b.pack);
  return seen;
}

/** Boards in a pack ("all" for every board). */
export function filterBoards(boards, pack) {
  return pack === "all" ? boards.slice() : boards.filter((b) => b.pack === pack);
}

/** The badge text for a board card from the played list. */
export function boardBadge(entry, played) {
  const record = played[entry.id];
  if (!record) return { text: "New", played: false };
  const times = record.plays === 1 ? "Played once" : `Played ${record.plays}×`;
  return { text: record.best === null ? times : `${times} · best ${formatScore(record.best)}`, played: true };
}

/**
 * @param {HTMLElement} el
 * @param {object} view      { index, played, pack }
 * @param {object} handlers  { onPack(pack), onPick(entry), onHome() }
 */
export function renderLibrary(el, view, handlers) {
  const packs = ["all", ...packsOf(view.index)];
  const boards = filterBoards(view.index.boards, view.pack);
  const chips = packs.map((p) => `<button type="button" class="chip ${p === view.pack ? "chip--on" : ""}" data-pack="${escapeHtml(p)}" aria-pressed="${p === view.pack}">${p === "all" ? "All" : escapeHtml(p)}</button>`).join("");
  const cards = boards.map((b) => {
    const badge = boardBadge(b, view.played);
    return `<li>
      <button type="button" class="card ${badge.played ? "card--played" : ""}" data-board="${escapeHtml(b.id)}">
        <span class="card__title">${escapeHtml(b.title)}</span>
        <span class="card__meta">${escapeHtml(b.pack)} · ${escapeHtml(b.difficulty)}</span>
        <span class="card__tags">${b.tags.map((t) => `<i>${escapeHtml(t)}</i>`).join("")}</span>
        <span class="card__badge">${escapeHtml(badge.text)}</span>
      </button>
    </li>`;
  }).join("");

  el.innerHTML = `
    <div class="panel library">
      <header class="panel__head">
        <div><p class="eyebrow eyebrow--ink">Library</p><h2>Pick a board</h2></div>
        <button type="button" class="btn btn--ink btn--small" data-home>Home</button>
      </header>
      <div class="chips" role="group" aria-label="Packs">${chips}</div>
      <ul class="cards">${cards || "<li class='cards__empty'>No boards in this pack yet.</li>"}</ul>
      <p class="results__stats">${view.index.boards.length} board${view.index.boards.length === 1 ? "" : "s"}. Quick Play on the Home screen picks one you have not played.</p>
    </div>`;
  for (const chip of el.querySelectorAll("[data-pack]")) chip.addEventListener("click", () => handlers.onPack(chip.dataset.pack));
  for (const card of el.querySelectorAll("[data-board]")) {
    card.addEventListener("click", () => handlers.onPick(view.index.boards.find((b) => b.id === card.dataset.board)));
  }
  el.querySelector("[data-home]").addEventListener("click", handlers.onHome);
}

/**
 * The difficulty sheet: Easy / Normal / Hard, the two opponents that choice
 * gives you, and Start. `view.opponents` comes from the engine's
 * previewOpponents() so the names match the game that starts.
 *
 * @param {HTMLElement} el    the overlay element (shown while open)
 * @param {object} view       { entry, difficulty, opponents, badge }
 * @param {object} handlers   { onDifficulty(id), onShuffle(), onStart(), onClose() }
 */
export function renderDifficultySheet(el, view, handlers) {
  const seg = DIFFICULTIES.map((d) => `<button type="button" class="seg__btn ${d.id === view.difficulty ? "seg__btn--on" : ""}" data-difficulty="${d.id}" aria-pressed="${d.id === view.difficulty}">${d.label}</button>`).join("");
  const chosen = DIFFICULTIES.find((d) => d.id === view.difficulty);
  const opps = view.opponents.map((o) => `<li class="opp opp--${o.colour}"><strong>${escapeHtml(o.name)}</strong><span>${escapeHtml(o.bio)}</span></li>`).join("");
  el.innerHTML = `
    <div class="pop__inner sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <p class="eyebrow eyebrow--ink">${escapeHtml(view.entry.pack)}${view.badge ? ` · ${escapeHtml(view.badge)}` : ""}</p>
      <h3 id="sheet-title">${escapeHtml(view.entry.title)}</h3>
      <div class="seg" role="group" aria-label="Difficulty">${seg}</div>
      <p class="sheet__blurb">${escapeHtml(chosen.blurb)}</p>
      <ul class="opps">${opps}</ul>
      <button type="button" class="btn btn--ink btn--small" data-shuffle>Different opponents</button>
      <div class="sheet__buttons">
        <button type="button" class="btn btn--ink btn--primary" data-start>Start game</button>
        <button type="button" class="btn btn--ink" data-close>Back</button>
      </div>
    </div>`;
  el.hidden = false;
  for (const b of el.querySelectorAll("[data-difficulty]")) b.addEventListener("click", () => handlers.onDifficulty(b.dataset.difficulty));
  el.querySelector("[data-shuffle]").addEventListener("click", handlers.onShuffle);
  el.querySelector("[data-start]").addEventListener("click", handlers.onStart);
  el.querySelector("[data-close]").addEventListener("click", handlers.onClose);
  el.querySelector("[data-start]").focus();
}
