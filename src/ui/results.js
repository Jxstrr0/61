// The results screen: the podium finish, a score graph by clue (three
// series), the player's category breakdown, and the clues they missed.
// Everything comes from summarize() (computed from the event log).

import { escapeHtml, formatScore } from "./podiums.js";

/** An inline SVG line chart of each contestant's score after every clue. */
export function scoreGraph(summary) {
  const W = 320, H = 140, PAD = { l: 8, r: 8, t: 10, b: 18 };
  const all = summary.series.flat();
  let min = Math.min(0, ...all), max = Math.max(0, ...all);
  if (max === min) max = min + 1;
  const n = summary.series[0].length;
  const x = (i) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const colours = { you: "var(--podium-you)", "cpu-a": "var(--podium-cpu-a)", "cpu-b": "var(--podium-cpu-b)" };
  const paths = summary.series.map((series, i) => {
    const d = series.map((v, j) => `${j === 0 ? "M" : "L"}${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const c = summary.contestants[i];
    return `<path d="${d}" fill="none" stroke="${colours[c.colour] ?? "currentColor"}" stroke-width="${c.isHuman ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"><title>${escapeHtml(c.name)}</title></path>`;
  });
  const rounds = [30, 60].filter((r) => r < n - 1).map((r) => `<line x1="${x(r).toFixed(1)}" y1="${PAD.t}" x2="${x(r).toFixed(1)}" y2="${H - PAD.b}" stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="3 3"/>`);
  const legend = summary.contestants.map((c, i) => `<span class="graph__key"><i style="background:${colours[c.colour]}"></i>${escapeHtml(c.name)} ${formatScore(summary.scores[i])}</span>`).join("");
  return `<figure class="graph">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score after each clue for all three contestants" preserveAspectRatio="none">
      <line x1="${PAD.l}" y1="${y(0).toFixed(1)}" x2="${W - PAD.r}" y2="${y(0).toFixed(1)}" stroke="currentColor" stroke-opacity="0.35"/>
      ${rounds.join("")}
      ${paths.join("")}
      <text x="${PAD.l}" y="${H - 4}" font-size="9" fill="currentColor" fill-opacity="0.7">Round 1</text>
      ${n > 31 ? `<text x="${x(30).toFixed(1)}" y="${H - 4}" font-size="9" fill="currentColor" fill-opacity="0.7" dx="3">Round 2</text>` : ""}
      ${n > 61 ? `<text x="${x(60).toFixed(1)}" y="${H - 4}" font-size="9" fill="currentColor" fill-opacity="0.7" dx="3">Final</text>` : ""}
    </svg>
    <figcaption class="graph__legend">${legend}</figcaption>
  </figure>`;
}

/**
 * @param {HTMLElement} el
 * @param {object} summary   from summarize()
 * @param {object} handlers  { onPlayAgain, onLibrary, onHome }
 * @param {object} options   { libraryEnabled }
 */
export function renderResults(el, summary, handlers, options = {}) {
  const order = summary.scores.map((s, i) => i).sort((a, b) => summary.scores[b] - summary.scores[a]);
  const me = summary.contestants.findIndex((c) => c.isHuman);
  const headline = summary.playerWon
    ? (summary.winners.length > 1 ? "A shared win!" : "You win!")
    : `${escapeHtml(summary.contestants[summary.winners[0]].name)} wins`;

  const podiums = order.map((i, place) => {
    const c = summary.contestants[i];
    return `<li class="finish__row finish__row--${c.colour} ${summary.winners.includes(i) ? "finish__row--winner" : ""}">
      <span class="finish__place">${place + 1}</span>
      <span class="finish__name">${escapeHtml(c.name)}</span>
      <span class="finish__score">${formatScore(summary.scores[i])}</span>
    </li>`;
  }).join("");

  const cats = (summary.byCategory ?? []).map((c) => {
    const pct = c.attempted ? Math.round((c.correct / c.attempted) * 100) : 0;
    return `<li class="catrow">
      <span class="catrow__name">${escapeHtml(c.name)}</span>
      <span class="catrow__bar"><i style="width:${pct}%"></i></span>
      <span class="catrow__num">${c.correct}/${c.attempted}</span>
    </li>`;
  }).join("");

  const missed = summary.missed.map((m) => `<li><strong>${escapeHtml(m.category)} ${m.value}</strong>: ${escapeHtml(m.text)} <em>${escapeHtml(m.answer)}</em>${m.yours ? ` <span class="missed__yours">(you said “${escapeHtml(m.yours)}”)</span>` : ""}</li>`).join("");

  el.innerHTML = `
    <div class="panel results">
      <p class="eyebrow eyebrow--ink">Final scores</p>
      <h2 class="results__headline">${headline}</h2>
      <ol class="finish">${podiums}</ol>
      ${scoreGraph(summary)}
      <h3>Your categories</h3>
      <ul class="catlist">${cats || "<li>You did not answer a clue.</li>"}</ul>
      <p class="results__stats">Buzz races won: ${summary.buzz.won}${summary.buzz.lost ? ` (lost ${summary.buzz.lost})` : ""}${summary.buzz.averageReactionMs ? ` · average buzz ${summary.buzz.averageReactionMs} ms` : ""}${summary.dailyDouble.attempted ? ` · Daily Doubles ${summary.dailyDouble.correct}/${summary.dailyDouble.attempted}` : ""}${summary.final.attempted ? ` · Final ${summary.final.correct ? "right" : "wrong"}` : ""}</p>
      <details class="missed">
        <summary>Clues you missed (${summary.missed.length})</summary>
        <ol>${missed || "<li>None. A perfect game.</li>"}</ol>
      </details>
      <div class="results__buttons">
        <button type="button" class="btn btn--primary btn--ink" data-again>Play again</button>
        <button type="button" class="btn btn--ink" data-library ${options.libraryEnabled ? "" : "disabled"}>Library</button>
        <button type="button" class="btn btn--ink" data-home>Home</button>
      </div>
    </div>`;
  el.querySelector("[data-again]").addEventListener("click", handlers.onPlayAgain);
  el.querySelector("[data-library]").addEventListener("click", handlers.onLibrary);
  el.querySelector("[data-home]").addEventListener("click", handlers.onHome);
  void me;
}
