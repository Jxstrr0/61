// 61 - A Trivia Game: boot, hash router, and the wiring between the rules
// engine (src/game.js, no DOM) and the screens (src/ui/*). This file and
// the ui/ modules are the only places that touch the DOM; nothing here
// decides a rule.

import { createGame, dispatch, chooseClueForCpu, findClue } from "./game.js";
import { randomSeed } from "./rng.js";
import * as storage from "./storage.js";
import { renderBoard } from "./ui/board.js";
import { renderClue, clueRenderKey, updateClueTimers } from "./ui/clue.js";
import { renderPodiums, escapeHtml, formatScore } from "./ui/podiums.js";

const SCREENS = ["home", "library", "game", "practice", "stats", "results", "about"];
const DEFAULT_SCREEN = "home";
const CPU_PICK_DELAY_MS = 1400;   // a CPU "thinks" before picking a clue
const REVEAL_HOLD_MS = 3000;      // how long the answer stays up before moving on

/** Reads the screen name out of the hash, falling back to Home. */
export function screenFromHash(hash) {
  const name = String(hash || "").replace(/^#/, "").split("?")[0];
  return SCREENS.includes(name) ? name : DEFAULT_SCREEN;
}

function $(selector, root = document) {
  return root.querySelector(selector);
}

// ---------------------------------------------------------------------------
// App state (not game state: that lives in the engine)
// ---------------------------------------------------------------------------

const app = {
  index: null,         // boards/index.json
  roster: null,        // data/opponents.json
  settings: storage.loadSettings(),
  state: null,         // the engine's game state
  ctx: { bubbles: {}, flash: {}, lastResult: null, wager: null, nudge: false },
  timers: { cpuPick: null, reveal: null, bubble: {} },
  lastClueKey: "",
  lastBoardKey: "",
  revealBoard: false,
  el: {},
};

async function boot() {
  app.el = {
    home: $("[data-screen='home']"),
    game: $("[data-screen='game']"),
    board: $("#board"),
    clue: $("#clue"),
    podiums: $("#podiums"),
    band: $("#band"),
    gameTitle: $("#game-title"),
    quickPlay: $("#quick-play"),
    categoryPop: $("#category-pop"),
  };

  window.addEventListener("hashchange", route);
  route();

  try {
    const [index, roster] = await Promise.all([
      fetch("./boards/index.json").then((r) => r.json()),
      fetch("./data/opponents.json").then((r) => r.json()),
    ]);
    app.index = index;
    app.roster = roster.opponents;
    app.el.quickPlay.disabled = false;
  } catch (error) {
    $("#home-note").textContent = "Could not load the board list. Check your connection and reload.";
    console.error(error);
  }

  app.el.quickPlay.addEventListener("click", quickPlay);
  document.addEventListener("keydown", onKeyDown);
  requestAnimationFrame(frame);

  // For poking at a live game from the console (and for scripted play tests).
  window.sixtyOne = { get state() { return app.state; }, act, startGame };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function showScreen(name) {
  const sections = document.querySelectorAll("[data-screen]");
  let found = false;
  for (const section of sections) {
    const match = section.dataset.screen === name;
    section.hidden = !match;
    if (match) found = true;
  }
  if (!found) for (const section of sections) section.hidden = section.dataset.screen !== DEFAULT_SCREEN;
  window.scrollTo(0, 0);
}

function route() {
  const name = screenFromHash(location.hash);
  if (name === "game" && !app.state) { location.hash = "#home"; return; }
  showScreen(name);
}

// ---------------------------------------------------------------------------
// Starting a game
// ---------------------------------------------------------------------------

/** Quick Play: a random board you have not played yet (or any, once you have played them all). */
async function quickPlay() {
  const played = storage.loadPlayed();
  const boards = app.index.boards;
  const unplayed = boards.filter((b) => !played[b.id]);
  const pool = unplayed.length ? unplayed : boards;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  await startGame(entry.id, "normal");
}

async function startGame(boardId, difficulty) {
  app.el.quickPlay.disabled = true;
  try {
    const board = await fetch(`./boards/${boardId}.json`).then((r) => r.json());
    app.state = createGame({ board, seed: randomSeed(), difficulty, roster: app.roster, playerName: app.settings.playerName });
    app.ctx = { bubbles: {}, flash: {}, lastResult: null, wager: null, nudge: false };
    clearTimers();
    app.lastClueKey = "";
    app.lastBoardKey = "";
    location.hash = "#game";
    showIntro();
  } finally {
    app.el.quickPlay.disabled = false;
  }
}

function showIntro() {
  const [, a, b] = app.state.contestants;
  showBand(`
    <h2 class="band__title">${escapeHtml(app.state.board.title)}</h2>
    <p>You're up against <strong>${escapeHtml(a.name)}</strong> and <strong>${escapeHtml(b.name)}</strong>.</p>
    <p class="band__bio">${escapeHtml(a.name)}: ${escapeHtml(a.bio)}</p>
    <p class="band__bio">${escapeHtml(b.name)}: ${escapeHtml(b.bio)}</p>
    <p>Tap a value to pick a clue. When the clue turns orange, tap it to buzz. Type your response and press Answer.</p>
  `, "Start", () => { act({ type: "start" }); });
  app.el.gameTitle.textContent = app.state.board.title;
  renderPodiums(app.el.podiums, app.state, app.ctx);
}

// ---------------------------------------------------------------------------
// Dispatching actions and reacting to what happened
// ---------------------------------------------------------------------------

function now() {
  return performance.now();
}

/** Sends an action to the engine, then updates the screen for what it produced. */
function act(action) {
  if (!app.state) return;
  dispatch(app.state, { now: now(), ...action });
  for (const event of app.state.lastEvents) onEvent(event);
  render();
  afterAction();
}

function onEvent(event) {
  const state = app.state;
  const names = state.contestants.map((c) => c.name);
  switch (event.type) {
    case "round.start":
      app.revealBoard = true;
      hideBand();
      break;
    case "lockout":
      flash(event.contestant, "lockout", 600);
      break;
    case "buzz":
      if (!state.contestants[event.contestant].isHuman) bubble(event.contestant, "…", 0);
      break;
    case "score": {
      if (event.kind === "final") break;
      app.ctx.lastResult = event;
      flash(event.contestant, event.correct ? "correct" : "wrong", 900);
      if (!state.contestants[event.contestant].isHuman) {
        const said = event.text ? `${event.text}. ` : "";
        bubble(event.contestant, `${said}${event.correct ? "Correct!" : "Incorrect."}`, 2600);
      }
      break;
    }
    case "dd.wager":
      if (!state.contestants[event.contestant].isHuman) bubble(event.contestant, `I'll wager ${formatScore(event.amount)}.`, 3000);
      break;
    case "nudge":
      app.ctx.nudge = true;
      break;
    case "clue.resolved":
      app.ctx.nudge = false;
      break;
    case "round.end":
      showBand(`
        <h2 class="band__title">End of ${state.board.rounds[event.round].name}</h2>
        <p>${event.scores.map((s, i) => `${escapeHtml(names[i])}: ${formatScore(s)}`).join(" · ")}</p>
        ${event.round + 1 < state.board.rounds.length
          ? `<p>Values are doubled in ${escapeHtml(state.board.rounds[event.round + 1].name)}. The contestant with the lowest score picks first.</p>`
          : `<p>On to the Final.</p>`}
      `, "Continue", () => act({ type: "next" }));
      break;
    case "final.start":
      // The Final round arrives in phase 5. For now, show the scores and go home.
      showBand(`
        <h2 class="band__title">Both rounds played</h2>
        <p>${state.contestants.map((c) => `${escapeHtml(c.name)}: ${formatScore(c.score)}`).join(" · ")}</p>
        <p>The Final round and the results screen arrive in the next build phase.</p>
      `, "Home", () => { app.state = null; storage.clearGame(); location.hash = "#home"; });
      break;
    default:
      break;
  }
}

/** Things that happen a moment after an action: CPU picks, auto-continue, autosave. */
function afterAction() {
  const state = app.state;
  if (!state) return;
  clearTimeout(app.timers.cpuPick);
  clearTimeout(app.timers.reveal);

  if (state.phase === "board") {
    storage.saveGame(state);
    if (!state.contestants[state.controller].isHuman) {
      bubble(state.controller, "Let me see…", CPU_PICK_DELAY_MS);
      app.timers.cpuPick = setTimeout(() => {
        const id = chooseClueForCpu(state);
        if (id && app.state === state && state.phase === "board") act({ type: "select", clueId: id });
      }, CPU_PICK_DELAY_MS);
    }
  }
  if (state.phase === "clue" && state.clue?.state === "resolved") {
    app.timers.reveal = setTimeout(() => {
      if (app.state === state && state.clue?.state === "resolved") act({ type: "next" });
    }, REVEAL_HOLD_MS);
  }
  if (state.phase === "roundEnd" || (state.phase === "final" && state.final?.stage === "category")) storage.saveGame(state);
}

function clearTimers() {
  clearTimeout(app.timers.cpuPick);
  clearTimeout(app.timers.reveal);
  for (const t of Object.values(app.timers.bubble)) clearTimeout(t);
  app.timers.bubble = {};
}

function bubble(index, text, ms) {
  app.ctx.bubbles[index] = text;
  clearTimeout(app.timers.bubble[index]);
  if (ms > 0) {
    app.timers.bubble[index] = setTimeout(() => {
      if (app.ctx.bubbles[index] === text) { delete app.ctx.bubbles[index]; renderPodiumsNow(); }
    }, ms);
  }
}

function flash(index, kind, ms) {
  app.ctx.flash[index] = kind;
  setTimeout(() => { if (app.ctx.flash[index] === kind) { delete app.ctx.flash[index]; renderPodiumsNow(); } }, ms);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const clueHandlers = {
  onBuzz: () => act({ type: "buzz" }),
  onAnswer: (text) => act({ type: "answer", text }),
  onRule: (correct) => act({ type: "rule", correct }),
  onWager: (amount) => { app.ctx.wager = null; act({ type: "wager", amount }); },
  onWagerChange: (amount) => { app.ctx.wager = amount; render(); },
  onNext: () => act({ type: "next" }),
};

const boardHandlers = {
  onSelect: (clueId) => act({ type: "select", clueId }),
  onCategory: (c) => showCategory(c),
};

function render() {
  const state = app.state;
  if (!state) return;
  const boardKey = [state.round, state.phase, state.controller, Object.keys(state.used).length, app.revealBoard].join("|");
  if (boardKey !== app.lastBoardKey) {
    renderBoard(app.el.board, state, boardHandlers, { reveal: app.revealBoard });
    app.lastBoardKey = boardKey;
    app.revealBoard = false;
  }
  const clueKey = clueRenderKey(state, app.ctx);
  if (clueKey !== app.lastClueKey) {
    renderClue(app.el.clue, state, clueHandlers, app.ctx);
    app.lastClueKey = clueKey;
  }
  renderPodiumsNow();
  app.el.game.classList.toggle("game--clue", state.phase === "clue");
}

function renderPodiumsNow() {
  if (app.state) renderPodiums(app.el.podiums, app.state, app.ctx);
}

/** One animation frame: tick the engine while a clue or the Final is live, move timer bars. */
function frame() {
  const state = app.state;
  if (state && (state.phase === "clue" || state.phase === "final")) {
    const before = state.clue?.state;
    dispatch(state, { type: "tick", now: now() });
    for (const event of state.lastEvents) onEvent(event);
    render(); // keyed, so this is cheap when nothing changed
    if (state.clue?.state !== before) afterAction();
    updateClueTimers(app.el.clue, state, now());
  }
  requestAnimationFrame(frame);
}

function onKeyDown(event) {
  if (!app.state || app.state.phase !== "clue") return;
  if (event.code !== "Space") return;
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
  event.preventDefault();
  act({ type: "buzz" });
}

// ---------------------------------------------------------------------------
// Bands (round transitions) and the category popover
// ---------------------------------------------------------------------------

function showBand(html, buttonLabel, onButton) {
  const band = app.el.band;
  band.innerHTML = `<div class="band__inner">${html}<button type="button" class="btn btn--primary" data-band-go>${escapeHtml(buttonLabel)}</button></div>`;
  band.hidden = false;
  $("[data-band-go]", band).addEventListener("click", onButton);
  $("[data-band-go]", band).focus();
}

function hideBand() {
  app.el.band.hidden = true;
  app.el.band.replaceChildren();
}

function showCategory(c) {
  const category = app.state.board.rounds[app.state.round].categories[c];
  const pop = app.el.categoryPop;
  pop.innerHTML = `<div class="pop__inner"><h3>${escapeHtml(category.name)}</h3>${category.note ? `<p>${escapeHtml(category.note)}</p>` : ""}<button type="button" class="btn btn--small" data-pop-close>Close</button></div>`;
  pop.hidden = false;
  $("[data-pop-close]", pop).addEventListener("click", () => { pop.hidden = true; });
  pop.addEventListener("click", (e) => { if (e.target === pop) pop.hidden = true; }, { once: true });
}

export { findClue };

// Only run the app in a browser; tests import screenFromHash from Node.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  boot();
}
