// The board grid: six category headers over five rows of values.
// Renders into a container; never computes rules (the engine owns those).

import { clueId } from "../game.js";

/** Short form of a category name for a 56 px cell: the full name, the CSS clamps it. */
function categoryLabel(name) {
  return name;
}

/**
 * @param {HTMLElement} el
 * @param {object} state          game state
 * @param {object} handlers       { onSelect(clueId), onCategory(catIndex) }
 * @param {object} options        { reveal: boolean } animate the category headers
 */
export function renderBoard(el, state, handlers, options = {}) {
  const round = state.board.rounds[state.round];
  const yourTurn = state.phase === "board" && state.contestants[state.controller].isHuman;
  el.classList.toggle("board--reveal", Boolean(options.reveal));
  el.classList.toggle("board--waiting", !yourTurn);
  el.setAttribute("aria-label", `${round.name} board`);

  const frag = document.createDocumentFragment();

  round.categories.forEach((category, c) => {
    const header = document.createElement("button");
    header.type = "button";
    header.className = "board__cat";
    header.style.setProperty("--i", c);
    header.dataset.cat = c;
    header.setAttribute("aria-label", `Category: ${category.name}${category.note ? `. ${category.note}` : ""}`);
    const done = category.clues.every((_, i) => state.used[clueId(state.round, c, i)]);
    if (done) header.classList.add("board__cat--done");
    const label = document.createElement("span");
    label.textContent = categoryLabel(category.name);
    const longest = Math.max(...category.name.split(/\s+/).map((w) => w.length));
    header.style.setProperty("--longest", longest);
    header.appendChild(label);
    header.addEventListener("click", () => handlers.onCategory(c));
    frag.appendChild(header);
  });

  for (let row = 0; row < 5; row += 1) {
    round.categories.forEach((category, c) => {
      const id = clueId(state.round, c, row);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "board__cell";
      cell.dataset.clue = id;
      if (state.used[id]) {
        cell.classList.add("board__cell--used");
        cell.disabled = true;
        cell.setAttribute("aria-label", `${category.name} ${category.clues[row].value}, played`);
      } else {
        cell.textContent = category.clues[row].value;
        cell.disabled = !yourTurn;
        cell.setAttribute("aria-label", `${category.name} for ${category.clues[row].value}`);
        cell.addEventListener("click", () => handlers.onSelect(id));
      }
      frag.appendChild(cell);
    });
  }

  el.replaceChildren(frag);
}
