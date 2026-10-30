// The Final round: category reveal, wager, the clue with a 30 s think
// timer and a handwriting canvas, the player's own ruling, then the
// reveals one contestant at a time. Renders into the same layer as the
// clue card.

import { TIMING } from "../game.js";
import { escapeHtml, formatScore } from "./podiums.js";

/** Rebuild key: changes whenever the Final screen needs rebuilding. */
export function finalRenderKey(state, ctx) {
  const f = state.final;
  if (!f) return "none";
  return ["final", state.phase, f.stage, f.revealed.length, Object.keys(f.wagers).length, ctx.wager ?? "", f.stage === "clue" ? "" : (ctx.drawing ? 1 : 0)].join("|");
}

/**
 * @param {HTMLElement} el
 * @param {object} state
 * @param {object} handlers  { onNext, onWager(amount), onWagerChange(amount), onDone, onRule(correct), onDrawingChange(dataUrl) }
 * @param {object} ctx       { wager, drawing (data URL of the player's handwriting) }
 */
export function renderFinal(el, state, handlers, ctx) {
  const f = state.final;
  if (!f) { el.hidden = true; return; }
  el.hidden = false;
  const me = state.contestants.findIndex((c) => c.isHuman);
  const inIt = f.eligible.includes(me);
  const final = state.board.final;
  const names = state.contestants.map((c) => c.name);
  const parts = [`<div class="clue__meta"><span class="eyebrow">Final</span><span class="clue__value">${escapeHtml(final.category)}</span></div>`];

  switch (f.stage) {
    case "category": {
      parts.push(`<div class="final__category">
        <p class="eyebrow">The category is</p>
        <h2 class="final__title">${escapeHtml(final.category)}</h2>
        ${final.note ? `<p class="clue__hint">${escapeHtml(final.note)}</p>` : ""}
        <p class="clue__hint">${inIt
          ? `Playing: ${f.eligible.map((i) => escapeHtml(names[i])).join(", ")}. Wager up to your score, then write your response by hand.`
          : `You finished with ${formatScore(state.contestants[me].score)}, so you sit this one out. Playing: ${f.eligible.map((i) => escapeHtml(names[i])).join(", ") || "nobody"}.`}</p>
        <button type="button" class="btn btn--primary" data-next>Continue</button>
      </div>`);
      break;
    }
    case "wager": {
      if (inIt && !(me in f.wagers)) {
        const max = state.contestants[me].score;
        const current = Math.min(max, Math.max(0, ctx.wager ?? Math.round(max / 2 / 100) * 100));
        const preset = (fr) => Math.round((max * fr) / 100) * 100;
        parts.push(`<div class="final__wager">
          <p class="clue__hint">Wager between 0 and ${formatScore(max)}. The others have wagered.</p>
          <div class="wager">
            <button type="button" class="btn btn--small" data-wager-delta="-100" aria-label="100 less">−100</button>
            <output class="wager__amount" aria-live="polite">${formatScore(current)}</output>
            <button type="button" class="btn btn--small" data-wager-delta="100" aria-label="100 more">+100</button>
          </div>
          <div class="wager__presets">
            <button type="button" class="btn btn--small" data-wager-set="0">Nothing</button>
            <button type="button" class="btn btn--small" data-wager-set="${preset(0.5)}">Half</button>
            <button type="button" class="btn btn--small" data-wager-set="${max}">All in</button>
          </div>
          <button type="button" class="btn btn--primary" data-wager-go>Wager ${formatScore(current)}</button>
        </div>`);
        el.className = "clue final final--wager";
        el.innerHTML = parts.join("");
        el.querySelectorAll("[data-wager-delta]").forEach((b) => b.addEventListener("click", () => handlers.onWagerChange(Math.min(max, Math.max(0, current + Number(b.dataset.wagerDelta))))));
        el.querySelectorAll("[data-wager-set]").forEach((b) => b.addEventListener("click", () => handlers.onWagerChange(Number(b.dataset.wagerSet))));
        el.querySelector("[data-wager-go]").addEventListener("click", () => handlers.onWager(current));
        return;
      }
      parts.push(`<div class="final__category">
        <p class="clue__hint">${inIt ? `Your wager: ${formatScore(f.wagers[me])}. ` : ""}Wagers are in. Here comes the clue: you have 30 seconds.</p>
        <button type="button" class="btn btn--primary" data-next>Show the clue</button>
      </div>`);
      break;
    }
    case "clue": {
      parts.push(`<div class="answer__bar answer__bar--final" data-timer><span></span></div>
        <div class="clue__card clue__card--static"><p class="clue__text">${escapeHtml(final.text)}</p></div>`);
      if (inIt) {
        parts.push(`<div class="pad">
          <canvas class="pad__canvas" data-pad aria-label="Write your response here with your finger"></canvas>
          <div class="pad__tools">
            <button type="button" class="btn btn--small" data-pad-clear>Clear</button>
            <button type="button" class="btn btn--primary btn--small" data-done>Done</button>
          </div>
        </div>`);
      } else {
        parts.push(`<p class="clue__hint">The others are writing.</p><button type="button" class="btn btn--primary" data-done>Skip ahead</button>`);
      }
      break;
    }
    case "ruling": {
      parts.push(`<div class="ruling">
        <p>We have: <strong>${escapeHtml(final.answer)}</strong></p>
        ${ctx.drawing ? `<img class="pad__image" src="${ctx.drawing}" alt="Your handwritten response">` : `<p class="clue__hint">You wrote nothing.</p>`}
        <div class="ruling__buttons">
          <button type="button" class="btn btn--primary" data-rule="1">I had it</button>
          <button type="button" class="btn" data-rule="0">I didn't</button>
        </div>
      </div>`);
      break;
    }
    case "reveal":
    case "done": {
      parts.push(`<p class="reveal__answer">${escapeHtml(final.answer)}</p>`);
      const rows = f.revealed.map((i) => {
        const c = state.contestants[i];
        const correct = c.isHuman ? Boolean(f.ruling) : Boolean(f.knows[i]);
        const wager = f.wagers[i] ?? 0;
        return `<li class="reveal__row reveal__row--${correct ? "correct" : "wrong"}">
          <span class="reveal__who">${escapeHtml(c.name)}</span>
          <span class="reveal__what">${c.isHuman ? (ctx.drawing ? `<img class="pad__thumb" src="${ctx.drawing}" alt="">` : "—") : escapeHtml(correct ? final.answer : "…")}</span>
          <span class="reveal__delta">${correct ? "✓" : "✗"} ${correct ? "+" : "−"}${formatScore(wager)}</span>
          <span class="reveal__total">${formatScore(c.score)}</span>
        </li>`;
      });
      parts.push(`<ol class="reveal__list">${rows.join("")}</ol>`);
      const nextUp = f.revealOrder[f.revealed.length];
      if (state.phase === "results") {
        parts.push(`<button type="button" class="btn btn--primary" data-results>See the results</button>`);
      } else {
        parts.push(`<button type="button" class="btn btn--primary" data-next>Reveal ${escapeHtml(names[nextUp])}</button>`);
      }
      break;
    }
    default:
      break;
  }

  el.className = `clue final final--${f.stage}`;
  el.innerHTML = parts.join("");
  el.querySelector("[data-next]")?.addEventListener("click", () => handlers.onNext());
  el.querySelector("[data-results]")?.addEventListener("click", () => handlers.onResults());
  el.querySelector("[data-done]")?.addEventListener("click", () => handlers.onDone());
  el.querySelectorAll("[data-rule]").forEach((b) => b.addEventListener("click", () => handlers.onRule(b.dataset.rule === "1")));
  const canvas = el.querySelector("[data-pad]");
  if (canvas) setUpPad(canvas, el.querySelector("[data-pad-clear]"), handlers.onDrawingChange, ctx.drawing);
}

/** Moves the 30 s bar each frame. */
export function updateFinalTimers(el, state, now) {
  const f = state.final;
  const bar = el.querySelector("[data-timer] > span");
  if (!bar || !f || f.stage !== "clue" || f.thinkEndsAt == null) return;
  const left = Math.max(0, f.thinkEndsAt - now) / TIMING.finalThinkMs;
  bar.style.transform = `scaleX(${left.toFixed(3)})`;
  bar.parentElement.classList.toggle("answer__bar--low", left < 0.25);
}

/**
 * A handwriting pad: Pointer Events, devicePixelRatio scaling, 4 px
 * round-cap strokes. Reports the drawing as a PNG data URL after each
 * stroke so the reveal can show it; nothing is saved anywhere.
 */
function setUpPad(canvas, clearButton, onChange, existing) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function size() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const snapshot = canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#141413";
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
  }
  size();
  if (existing) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
    img.src = existing;
  }

  let drawing = false;
  let last = null;
  const point = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = point(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.1, last.y + 0.1); // a dot for a tap
    ctx.stroke();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    onChange(canvas.toDataURL("image/png"));
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);
  clearButton?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  });
  window.addEventListener("resize", size, { passive: true });
}
