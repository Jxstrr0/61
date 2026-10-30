// The full-screen clue card: reading, go-light, buzz, typed answer with a
// timer bar, Daily Double wager, borderline ruling, and the reveal.
// Tapping anywhere on the card is the buzz.

import { TIMING, findClue } from "../game.js";
import { escapeHtml, formatScore } from "./podiums.js";
import { dailyDoubleLimits } from "../cpu.js";

/** A string that changes whenever the card needs rebuilding (not every frame). */
export function clueRenderKey(state, ctx) {
  const c = state.clue;
  if (!c) return "none";
  return [c.id, c.state, c.answerer, c.attempted.length, c.wager, ctx.lastResult?.t ?? "", ctx.wager ?? "", ctx.nudge ? 1 : 0].join("|");
}

/**
 * @param {HTMLElement} el
 * @param {object} state
 * @param {object} handlers { onBuzz, onAnswer(text), onRule(correct), onWager(amount), onNext, onWagerChange(amount) }
 * @param {object} ctx      { lastResult, wager, nudge }
 */
export function renderClue(el, state, handlers, ctx) {
  const clue = state.clue;
  if (!clue) { el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  const info = findClue(state.board, clue.id);
  const names = state.contestants.map((c) => c.name);
  const me = state.contestants.findIndex((c) => c.isHuman);
  const parts = [];

  parts.push(`<div class="clue__meta">
    <span class="eyebrow">${escapeHtml(info.category.name)}</span>
    <span class="clue__value">${clue.wager != null ? `Wager ${formatScore(clue.wager)}` : clue.value}</span>
  </div>`);

  if (clue.state === "wager") {
    const limits = dailyDoubleLimits(state.contestants[me].score, 1000 * info.round.multiplier);
    const current = Math.min(limits.max, Math.max(limits.min, ctx.wager ?? Math.min(limits.max, 1000 * info.round.multiplier)));
    const preset = (f) => Math.max(limits.min, Math.round((limits.max * f) / 100) * 100 || limits.min);
    parts.push(`
      <div class="clue__dd">Daily Double</div>
      <p class="clue__hint">Only you can answer. Wager between ${limits.min} and ${formatScore(limits.max)}.</p>
      <div class="wager">
        <button type="button" class="btn btn--small" data-wager-delta="-100" aria-label="100 less">−100</button>
        <output class="wager__amount" aria-live="polite">${formatScore(current)}</output>
        <button type="button" class="btn btn--small" data-wager-delta="100" aria-label="100 more">+100</button>
      </div>
      <div class="wager__presets">
        <button type="button" class="btn btn--small" data-wager-set="${preset(0.25)}">25%</button>
        <button type="button" class="btn btn--small" data-wager-set="${preset(0.5)}">50%</button>
        <button type="button" class="btn btn--small" data-wager-set="${limits.max}">All in</button>
      </div>
      <button type="button" class="btn btn--primary" data-wager-go>Wager ${formatScore(current)}</button>
    `);
    el.className = "clue clue--wager";
    el.innerHTML = parts.join("");
    el.querySelectorAll("[data-wager-delta]").forEach((b) => b.addEventListener("click", () => handlers.onWagerChange(Math.min(limits.max, Math.max(limits.min, current + Number(b.dataset.wagerDelta))))));
    el.querySelectorAll("[data-wager-set]").forEach((b) => b.addEventListener("click", () => handlers.onWagerChange(Number(b.dataset.wagerSet))));
    el.querySelector("[data-wager-go]").addEventListener("click", () => handlers.onWager(current));
    return;
  }

  // The clue text itself (also the buzz target)
  const ddLine = clue.wager != null && clue.answerer !== null && !state.contestants[clue.answerer]?.isHuman
    ? `<p class="clue__hint">${escapeHtml(names[clue.answerer])} wagers ${formatScore(clue.wager)}</p>`
    : clue.wager != null ? `<p class="clue__hint">Daily Double. Your answer alone.</p>` : "";
  parts.push(`<button type="button" class="clue__card" data-buzz aria-label="Clue. Tap to buzz in.">
    <p class="clue__text">${escapeHtml(clue.text)}</p>
    ${ddLine}
  </button>`);

  const result = ctx.lastResult && ctx.lastResult.clueId === clue.id ? ctx.lastResult : null;

  if (clue.state === "reading") {
    parts.push(`<p class="clue__status">Read it… wait for the light</p>`);
  } else if (clue.state === "open") {
    const rebound = clue.attempted.length > 0;
    parts.push(`<p class="clue__status clue__status--go">${rebound ? "Buzzers open again. " : ""}Tap to buzz</p>`);
    if (result && !result.correct) parts.push(resultLine(result, names));
  } else if (clue.state === "answering") {
    const who = clue.answerer;
    if (who === me) {
      parts.push(`
        <form class="answer" data-answer-form autocomplete="off">
          <div class="answer__bar" data-timer><span></span></div>
          <input class="answer__input" data-answer-input type="text" inputmode="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="What is…" aria-label="Your response" enterkeyhint="send">
          <button type="submit" class="btn btn--primary">Answer</button>
        </form>
        ${ctx.nudge ? `<p class="clue__nudge">Remember to phrase it as a question</p>` : ""}
      `);
    } else {
      parts.push(`<p class="clue__status">${escapeHtml(names[who])} is answering…</p>`);
    }
  } else if (clue.state === "ruling") {
    parts.push(`
      <div class="ruling">
        <p>We have: <strong>${escapeHtml(info.clue.answer)}</strong></p>
        <p>Your response: <strong>${escapeHtml(clue.pending?.text ?? "")}</strong></p>
        <div class="ruling__buttons">
          <button type="button" class="btn btn--primary" data-rule="1">I had it</button>
          <button type="button" class="btn" data-rule="0">I didn't</button>
        </div>
      </div>
    `);
  } else if (clue.state === "resolved") {
    parts.push(`<div class="reveal">
      ${result ? resultLine(result, names) : `<p class="reveal__line">Nobody got it.</p>`}
      <p class="reveal__answer">${escapeHtml(info.clue.answer)}</p>
      <button type="button" class="btn btn--primary" data-next>Continue</button>
    </div>`);
  }

  el.className = `clue clue--${clue.state}`;
  el.innerHTML = parts.join("");

  const card = el.querySelector("[data-buzz]");
  if (card) {
    card.disabled = !(clue.state === "reading" || clue.state === "open") || clue.attempted.includes(me);
    card.addEventListener("pointerdown", (e) => { e.preventDefault(); handlers.onBuzz(); });
  }
  const form = el.querySelector("[data-answer-form]");
  if (form) {
    const input = form.querySelector("[data-answer-input]");
    form.addEventListener("submit", (e) => { e.preventDefault(); handlers.onAnswer(input.value); });
    input.focus({ preventScroll: true });
  }
  el.querySelectorAll("[data-rule]").forEach((b) => b.addEventListener("click", () => handlers.onRule(b.dataset.rule === "1")));
  el.querySelector("[data-next]")?.addEventListener("click", () => handlers.onNext());
}

function resultLine(result, names) {
  const who = names[result.contestant];
  const text = result.text ? ` “${escapeHtml(result.text)}”` : "";
  return `<p class="reveal__line reveal__line--${result.correct ? "correct" : "wrong"}">
    <span aria-hidden="true">${result.correct ? "✓" : "✗"}</span> ${escapeHtml(who)}${text}: ${result.correct ? "correct" : "incorrect"} (${result.delta > 0 ? "+" : ""}${formatScore(result.delta)})
  </p>`;
}

/** Called every frame: moves the typing timer bar without rebuilding the card. */
export function updateClueTimers(el, state, now) {
  const clue = state.clue;
  const bar = el.querySelector("[data-timer] > span");
  if (!bar || !clue || clue.state !== "answering" || clue.deadline == null) return;
  const left = Math.max(0, clue.deadline - now) / TIMING.answerMs;
  bar.style.transform = `scaleX(${left.toFixed(3)})`;
  bar.parentElement.classList.toggle("answer__bar--low", left < 0.3);
}
