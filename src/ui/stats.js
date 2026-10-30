// The Stats screen: career numbers from storage.loadStats(), accuracy bars
// per category tag, and a reset button that asks twice.

import { escapeHtml, formatScore } from "./podiums.js";

function pct(correct, attempted) {
  return attempted ? `${Math.round((correct / attempted) * 100)} %` : "—";
}

/** The headline numbers as label/value rows (pure, so it can be tested). */
export function statsRows(stats) {
  const buzzTotal = stats.buzz.won + stats.buzz.lost;
  const avgBuzz = stats.buzz.reactionCount ? `${Math.round(stats.buzz.reactionTotalMs / stats.buzz.reactionCount)} ms` : "—";
  return [
    { label: "Games", value: String(stats.games) },
    { label: "Wins", value: `${stats.wins} (${pct(stats.wins, stats.games)})` },
    { label: "Total winnings", value: formatScore(stats.totalWinnings) },
    { label: "Best game", value: stats.bestGame === null ? "—" : formatScore(stats.bestGame) },
    { label: "Win streak", value: `${stats.currentStreak} now · ${stats.bestStreak} best` },
    { label: "Buzz races", value: buzzTotal ? `${pct(stats.buzz.won, buzzTotal)} of ${buzzTotal}` : "—" },
    { label: "Average buzz", value: avgBuzz },
    { label: "Daily Doubles", value: stats.dailyDouble.attempted ? `${stats.dailyDouble.correct}/${stats.dailyDouble.attempted}` : "—" },
    { label: "Finals", value: stats.final.attempted ? `${stats.final.correct}/${stats.final.attempted}` : "—" },
  ];
}

/** Category tags sorted by how often you have met them, with accuracy. */
export function categoryRows(stats) {
  return Object.entries(stats.categories)
    .map(([tag, r]) => ({ tag, correct: r.correct, attempted: r.attempted, pct: r.attempted ? Math.round((r.correct / r.attempted) * 100) : 0 }))
    .sort((a, b) => b.attempted - a.attempted || a.tag.localeCompare(b.tag));
}

/** Games and wins by difficulty, only the ones you have played. */
export function difficultyRows(stats) {
  return ["easy", "normal", "hard"]
    .map((id) => ({ id, ...stats.byDifficulty[id] }))
    .filter((d) => d.games > 0);
}

/**
 * @param {HTMLElement} el
 * @param {object} stats     from storage.loadStats()
 * @param {object} handlers  { onReset(), onHome() }
 * @param {object} options   { confirming }  true while the reset is awaiting a second tap
 */
export function renderStats(el, stats, handlers, options = {}) {
  const tiles = statsRows(stats).map((r) => `<li class="stat"><span class="stat__value">${escapeHtml(r.value)}</span><span class="stat__label">${escapeHtml(r.label)}</span></li>`).join("");
  const cats = categoryRows(stats).map((c) => `<li class="catrow">
      <span class="catrow__name">${escapeHtml(c.tag)}</span>
      <span class="catrow__bar"><i style="width:${c.pct}%"></i></span>
      <span class="catrow__num">${c.correct}/${c.attempted}</span>
    </li>`).join("");
  const diffs = difficultyRows(stats).map((d) => `${d.id}: ${d.wins}/${d.games}`).join(" · ");
  el.innerHTML = `
    <div class="panel stats">
      <header class="panel__head">
        <div><p class="eyebrow eyebrow--ink">Career</p><h2>Your stats</h2></div>
        <button type="button" class="btn btn--ink btn--small" data-home>Home</button>
      </header>
      ${stats.games ? "" : `<p class="stats__empty">No games yet. Play one and your record shows up here. Stats stay on this device.</p>`}
      <ul class="statgrid">${tiles}</ul>
      ${diffs ? `<p class="results__stats">Wins by difficulty · ${escapeHtml(diffs)}</p>` : ""}
      <h3>Categories</h3>
      <ul class="catlist">${cats || "<li class='stats__empty'>Your accuracy by topic appears after your first game.</li>"}</ul>
      <div class="stats__reset">
        ${options.confirming
          ? `<p class="stats__warn">This wipes your record and the played list on this device. Sure?</p>
             <div class="ruling__buttons"><button type="button" class="btn btn--ink btn--small btn--danger" data-reset>Yes, reset</button><button type="button" class="btn btn--ink btn--small" data-cancel>Keep</button></div>`
          : `<button type="button" class="btn btn--ink" data-reset ${stats.games ? "" : "disabled"}>Reset stats</button>`}
      </div>
    </div>`;
  el.querySelector("[data-home]").addEventListener("click", handlers.onHome);
  el.querySelector("[data-reset]").addEventListener("click", handlers.onReset);
  el.querySelector("[data-cancel]")?.addEventListener("click", handlers.onCancel);
}
