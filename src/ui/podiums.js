// The three podiums along the bottom: you in the middle, a computer
// contestant either side. Shows scores, who controls the board, who is
// answering, and a short speech bubble for CPU responses.

const ORDER = [1, 0, 2]; // left, middle, right by contestant index

export function formatScore(n) {
  const abs = Math.abs(n).toLocaleString("en-CA");
  return n < 0 ? `−${abs}` : abs;
}

/**
 * @param {HTMLElement} el
 * @param {object} state
 * @param {object} ctx   { bubbles: {index: text}, flash: {index: "lockout"|"correct"|"wrong"} }
 */
export function renderPodiums(el, state, ctx = {}) {
  const answering = state.phase === "clue" ? state.clue?.answerer : null;
  const frag = document.createDocumentFragment();
  for (const index of ORDER) {
    const c = state.contestants[index];
    if (!c) continue;
    const podium = document.createElement("div");
    podium.className = `podium podium--${c.colour}`;
    podium.dataset.index = index;
    if (state.controller === index && state.phase === "board") podium.classList.add("podium--controller");
    if (answering === index) podium.classList.add("podium--answering");
    if (ctx.flash?.[index]) podium.classList.add(`podium--${ctx.flash[index]}`);
    if (state.phase === "final" && state.final && !state.final.eligible.includes(index)) podium.classList.add("podium--out");

    const bubble = ctx.bubbles?.[index];
    podium.innerHTML = `
      ${bubble ? `<div class="podium__bubble" role="status">${escapeHtml(bubble)}</div>` : ""}
      <div class="podium__score ${c.score < 0 ? "podium__score--neg" : ""}">${formatScore(c.score)}</div>
      <div class="podium__name">${escapeHtml(c.name)}</div>
    `;
    frag.appendChild(podium);
  }
  el.replaceChildren(frag);
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
