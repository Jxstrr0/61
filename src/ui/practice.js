// Practice screen: a mode picker, then an endless clue card against one
// Normal opponent with a running strip of your buzz numbers. The card
// reuses the game's clue styles; the rules live in src/practice.js.

import { TIMING } from "../game.js";
import { averageReaction, winRate } from "../practice.js";
import { escapeHtml } from "./podiums.js";

/**
 * The picker shown before a drill starts.
 * @param {HTMLElement} el
 * @param {object} view      { mode: "buzz"|"answer", loading: boolean, error: string|null }
 * @param {object} handlers  { onMode(mode), onStart() }
 */
export function renderPracticeSetup(el, view, handlers) {
  el.innerHTML = `
    <div class="practice__setup">
      <p class="eyebrow">Practice</p>
      <h2 class="band__title">Learn the buzzer</h2>
      <p>Clues from every board, one after another, against a Normal opponent. No scores, just your reaction times and how often you win the race.</p>
      <div class="seg seg--stage" role="group" aria-label="Mode">
        <button type="button" class="seg__btn ${view.mode === "buzz" ? "seg__btn--on" : ""}" data-mode="buzz" aria-pressed="${view.mode === "buzz"}">Buzz only</button>
        <button type="button" class="seg__btn ${view.mode === "answer" ? "seg__btn--on" : ""}" data-mode="answer" aria-pressed="${view.mode === "answer"}">Buzz + type</button>
      </div>
      <p class="band__bio">${view.mode === "buzz" ? "Win the race and the clue is yours; the answer shows straight away." : "Win the race, then type the response inside ten seconds."}</p>
      ${view.error ? `<p class="band__bio">${escapeHtml(view.error)}</p>` : ""}
      <button type="button" class="btn btn--primary" data-start ${view.loading ? "disabled" : ""}>${view.loading ? "Loading clues…" : "Start"}</button>
      <a class="btn" href="#home">Home</a>
    </div>`;
  for (const b of el.querySelectorAll("[data-mode]")) b.addEventListener("click", () => handlers.onMode(b.dataset.mode));
  el.querySelector("[data-start]").addEventListener("click", handlers.onStart);
}

/** A string that changes whenever the drill card needs rebuilding. */
export function practiceRenderKey(state) {
  const c = state.clue;
  if (!c) return "none";
  return [state.stats.seen, c.state, c.result?.winner ?? "", c.result?.correct ?? "", state.stats.early].join("|");
}

function ms(n) {
  return n === null || n === undefined ? "—" : `${Math.round(n)} ms`;
}

/**
 * The live drill.
 * @param {HTMLElement} el
 * @param {object} state     from createPractice()
 * @param {object} handlers  { onBuzz, onAnswer(text), onRule(correct), onNext, onStop }
 */
export function renderPracticeClue(el, state, handlers) {
  const c = state.clue;
  const s = state.stats;
  const rate = winRate(s);
  const last = s.reactions.length ? s.reactions[s.reactions.length - 1] : null;
  const strip = `
    <div class="drill" role="status">
      <span><b>${s.won}</b> of ${s.won + s.lostRace + s.unanswered} races${rate === null ? "" : ` · ${Math.round(rate * 100)} %`}</span>
      <span>last <b>${ms(last)}</b></span>
      <span>avg <b>${ms(averageReaction(s))}</b></span>
      <span>early <b>${s.early}</b></span>
      ${state.mode === "answer" ? `<span>right <b>${s.correct}/${s.attempted}</b></span>` : ""}
      <button type="button" class="btn btn--small" data-stop>Stop</button>
    </div>`;

  const parts = [`<div class="clue__meta"><span class="eyebrow">${escapeHtml(c.category)}</span><span class="clue__value">#${s.seen}</span></div>`];
  parts.push(`<button type="button" class="clue__card" data-buzz aria-label="Clue. Tap to buzz in."><p class="clue__text">${escapeHtml(c.text)}</p></button>`);

  const opp = escapeHtml(state.opponent.name);
  if (c.state === "reading") parts.push(`<p class="clue__status">Read it… wait for the light</p>`);
  else if (c.state === "open") parts.push(`<p class="clue__status clue__status--go">Tap to buzz</p>`);
  else if (c.state === "answering") {
    parts.push(`
      <p class="clue__status clue__status--go">You won it in ${ms(c.result.reaction)}</p>
      <form class="answer" data-answer-form autocomplete="off">
        <div class="answer__bar" data-timer><span></span></div>
        <input class="answer__input" data-answer-input type="text" inputmode="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="What is…" aria-label="Your response" enterkeyhint="send">
        <button type="submit" class="btn btn--primary">Answer</button>
      </form>`);
  } else if (c.state === "ruling") {
    parts.push(`<div class="ruling">
      <p>We have: <strong>${escapeHtml(c.answer)}</strong></p>
      <p>Your response: <strong>${escapeHtml(c.pending?.text ?? "")}</strong></p>
      <div class="ruling__buttons">
        <button type="button" class="btn btn--primary" data-rule="1">I had it</button>
        <button type="button" class="btn" data-rule="0">I didn't</button>
      </div>
    </div>`);
  } else if (c.state === "resolved") {
    const r = c.result;
    let line;
    if (r.winner === "you") {
      line = state.mode === "answer"
        ? `<span aria-hidden="true">${r.correct ? "✓" : "✗"}</span> You buzzed in ${ms(r.reaction)} and were ${r.correct ? "correct" : "incorrect"}`
        : `<span aria-hidden="true">✓</span> You won the race in ${ms(r.reaction)}`;
    } else if (r.winner === "cpu") {
      line = `<span aria-hidden="true">✗</span> ${opp} beat you in ${ms(r.reaction)}${r.correct ? "" : " and got it wrong"}`;
    } else line = `Nobody buzzed`;
    const good = r.winner === "you" && r.correct !== false;
    parts.push(`<div class="reveal">
      <p class="reveal__line reveal__line--${good ? "correct" : "wrong"}">${line}</p>
      <p class="reveal__answer">${escapeHtml(c.answer)}</p>
      <button type="button" class="btn btn--primary" data-next>Next clue</button>
    </div>`);
  }

  el.innerHTML = `${strip}<div class="clue clue--practice clue--${c.state}">${parts.join("")}</div>`;
  const card = el.querySelector("[data-buzz]");
  card.disabled = !(c.state === "reading" || c.state === "open");
  card.addEventListener("pointerdown", (e) => { e.preventDefault(); handlers.onBuzz(); });
  const form = el.querySelector("[data-answer-form]");
  if (form) {
    const input = form.querySelector("[data-answer-input]");
    form.addEventListener("submit", (e) => { e.preventDefault(); handlers.onAnswer(input.value); });
    input.focus({ preventScroll: true });
  }
  el.querySelectorAll("[data-rule]").forEach((b) => b.addEventListener("click", () => handlers.onRule(b.dataset.rule === "1")));
  el.querySelector("[data-next]")?.addEventListener("click", handlers.onNext);
  el.querySelector("[data-stop]").addEventListener("click", handlers.onStop);
}

/** Every frame: the typing bar. */
export function updatePracticeTimers(el, state, now) {
  const c = state.clue;
  const bar = el.querySelector("[data-timer] > span");
  if (!bar || !c || c.state !== "answering") return;
  const left = Math.max(0, c.deadline - now) / TIMING.answerMs;
  bar.style.transform = `scaleX(${left.toFixed(3)})`;
  bar.parentElement.classList.toggle("answer__bar--low", left < 0.3);
}
