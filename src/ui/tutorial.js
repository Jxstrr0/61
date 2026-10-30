// The first-run tutorial: four cards with Skip, shown once (storage keeps
// the flag) and again from "How to play" on the Home screen. The second
// card has a small demo clue card that keeps turning from purple to the
// orange go-light so the timing is clear before the first real clue.

import { escapeHtml } from "./podiums.js";

export const CARDS = [
  {
    title: "The board",
    body: "Six categories, five clues each. Higher values are harder. Tap a value to pick a clue; tap a category name to read it in full. Whoever answers correctly picks next.",
    figure: `<div class="tut__grid" aria-hidden="true">
      ${["CAP", "BODY", "PRAIRIE", "BARD", "NUMBERS", "COLOUR"].map((c) => `<i class="tut__cat">${c}</i>`).join("")}
      ${[200, 400, 600, 800, 1000].flatMap((v) => Array.from({ length: 6 }, () => `<i class="tut__cell">${v}</i>`)).join("")}
    </div>`,
  },
  {
    title: "Wait for the light",
    body: "Read the clue. When the card turns orange, tap it (or press Space) to buzz in. Buzz before the light and you are locked out for a quarter second, which is usually long enough to lose the race.",
    figure: `<div class="tut__demo" aria-hidden="true"><span>This Prairie city hosts the Stampede</span><em>Tap to buzz</em></div>`,
  },
  {
    title: "Type your response",
    body: "Win the buzz and you have ten seconds to type. Spelling close enough counts; \"What is…\" is welcome but not required. If it is a near miss, you make the call yourself.",
    figure: `<div class="tut__answer" aria-hidden="true"><div class="answer__bar"><span style="transform:scaleX(.7)"></span></div><div class="tut__input">What is Calgary</div></div>`,
  },
  {
    title: "Doubles and the Final",
    body: "Three clues hide a Daily Double: only you answer, and you wager first. After two rounds comes the Final: everyone above zero wagers, then you handwrite your response on the screen.",
    figure: `<div class="tut__final" aria-hidden="true"><b>Daily Double</b><span>Wager 1,000</span></div>`,
  },
];

/**
 * @param {HTMLElement} el   overlay element
 * @param {object} view      { step }
 * @param {object} handlers  { onStep(n), onSkip(), onDone() }
 */
export function renderTutorial(el, view, handlers) {
  const step = Math.max(0, Math.min(CARDS.length - 1, view.step));
  const card = CARDS[step];
  const last = step === CARDS.length - 1;
  const dots = CARDS.map((_, i) => `<i class="${i === step ? "tut__dot--on" : ""}"></i>`).join("");
  el.innerHTML = `
    <div class="pop__inner sheet tut" role="dialog" aria-modal="true" aria-labelledby="tut-title">
      <p class="eyebrow eyebrow--ink">How to play · ${step + 1} of ${CARDS.length}</p>
      <h3 id="tut-title">${escapeHtml(card.title)}</h3>
      ${card.figure}
      <p class="tut__body">${escapeHtml(card.body)}</p>
      <div class="tut__dots" aria-hidden="true">${dots}</div>
      <div class="sheet__buttons">
        <button type="button" class="btn btn--ink btn--primary" data-next>${last ? "Got it, let's play" : "Next"}</button>
        <div class="ruling__buttons">
          <button type="button" class="btn btn--ink btn--small" data-back ${step === 0 ? "disabled" : ""}>Back</button>
          <button type="button" class="btn btn--ink btn--small" data-skip>${last ? "Close" : "Skip"}</button>
        </div>
      </div>
    </div>`;
  el.hidden = false;
  el.querySelector("[data-next]").addEventListener("click", () => (last ? handlers.onDone() : handlers.onStep(step + 1)));
  el.querySelector("[data-back]").addEventListener("click", () => handlers.onStep(step - 1));
  el.querySelector("[data-skip]").addEventListener("click", handlers.onSkip);
  el.querySelector("[data-next]").focus();
}
