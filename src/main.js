// 61 - A Trivia Game: boot, hash router, and the wiring between the rules
// engine (src/game.js, no DOM) and the screens (src/ui/*). This file and
// the ui/ modules are the only places that touch the DOM; nothing here
// decides a rule.

import { createGame, dispatch, chooseClueForCpu, findClue, summarize, previewOpponents } from "./game.js";
import { randomSeed } from "./rng.js";
import * as storage from "./storage.js";
import { renderBoard } from "./ui/board.js";
import { renderClue, clueRenderKey, updateClueTimers } from "./ui/clue.js";
import { renderPodiums, escapeHtml, formatScore } from "./ui/podiums.js";
import { renderFinal, finalRenderKey, updateFinalTimers } from "./ui/final.js";
import { renderResults } from "./ui/results.js";
import { renderLibrary, renderDifficultySheet, boardBadge } from "./ui/library.js";
import { renderStats } from "./ui/stats.js";
import * as audio from "./audio.js";
import { renderTutorial } from "./ui/tutorial.js";
import { createPractice, dispatchPractice, cluesFromBoard } from "./practice.js";
import { renderPracticeSetup, renderPracticeClue, practiceRenderKey, updatePracticeTimers } from "./ui/practice.js";

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
  ctx: { bubbles: {}, flash: {}, lastResult: null, wager: null, nudge: false, drawing: null },
  summary: null,       // the finished game, for the results screen
  library: { pack: "all" },   // the Library's current pack filter
  sheet: null,         // the open difficulty sheet: { entry, difficulty, seed }
  tutorial: null,      // the open tutorial: { step, then }  (then: what to do when it closes)
  countUp: null,       // podium score animation: { from, to, start, duration }
  practice: { state: null, mode: "buzz", clues: null, loading: false, error: null, lastKey: "" },
  statsConfirm: false, // the Stats reset button is waiting for its second tap
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
    resume: $("#resume"),
    results: $("#results"),
    categoryPop: $("#category-pop"),
    library: $("#library"),
    stats: $("#stats"),
    sheet: $("#sheet"),
    goLibrary: $("#go-library"),
    goStats: $("#go-stats"),
    howTo: $("#how-to"),
    goPractice: $("#go-practice"),
    practice: $("#practice"),
    tutorial: $("#tutorial"),
    muteButtons: document.querySelectorAll("[data-mute]"),
  };
  audio.setMuted(app.settings.muted);
  renderMute();
  for (const b of app.el.muteButtons) b.addEventListener("click", toggleMute);
  // Browsers only start audio after a gesture: unlock on the first one.
  const unlock = () => { audio.unlock(); };
  document.addEventListener("pointerdown", unlock, { capture: true });
  document.addEventListener("keydown", unlock, { capture: true });

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
    app.el.goLibrary.disabled = false;
    if (screenFromHash(location.hash) === "library") renderLibraryScreen();
  } catch (error) {
    $("#home-note").textContent = "Could not load the board list. Check your connection and reload.";
    console.error(error);
  }

  app.el.quickPlay.addEventListener("click", quickPlay);
  app.el.resume.addEventListener("click", resumeGame);
  app.el.goLibrary.addEventListener("click", () => { location.hash = "#library"; });
  app.el.goStats.addEventListener("click", () => { location.hash = "#stats"; });
  app.el.howTo.addEventListener("click", () => openTutorial(null));
  app.el.goPractice.addEventListener("click", () => { location.hash = "#practice"; });
  app.el.sheet.addEventListener("click", (e) => { if (e.target === app.el.sheet) closeSheet(); });
  document.addEventListener("keydown", onKeyDown);
  requestAnimationFrame(frame);

  // For poking at a live game from the console (and for scripted play tests).
  window.sixtyOne = { get state() { return app.state; }, act, startGame };
}

function toggleMute() {
  app.settings.muted = !app.settings.muted;
  storage.saveSettings(app.settings);
  audio.setMuted(app.settings.muted);
  if (app.settings.muted) audio.stopFinalMusic();
  renderMute();
}

function renderMute() {
  for (const b of app.el.muteButtons) {
    b.setAttribute("aria-pressed", String(app.settings.muted));
    b.textContent = app.settings.muted ? "Sound off" : "Sound on";
    b.title = app.settings.muted ? "Turn sound on" : "Turn sound off";
  }
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
  if (name === "results" && !app.summary) { location.hash = "#home"; return; }
  if (name === "home") app.el.resume.hidden = !(app.state && app.state.phase !== "results") && !storage.loadGame();
  if (name === "library") renderLibraryScreen();
  if (name === "stats") { app.statsConfirm = false; renderStatsScreen(); }
  if (name === "practice") renderPracticeScreen();
  else if (app.practice.state) stopPractice();
  if (name !== "library" && name !== "home") closeSheet();
  if (name !== "home" && app.tutorial && !app.tutorial.then) { app.tutorial = null; app.el.tutorial.hidden = true; }
  showScreen(name);
}

// ---------------------------------------------------------------------------
// Starting a game
// ---------------------------------------------------------------------------

/** Quick Play: a random board you have not played yet (or any, once you have played them all), then the difficulty sheet. */
function quickPlay() {
  const played = storage.loadPlayed();
  const boards = app.index.boards;
  const unplayed = boards.filter((b) => !played[b.id]);
  const pool = unplayed.length ? unplayed : boards;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  openSheet(entry);
}

/** The difficulty sheet for a board: pick Easy / Normal / Hard, meet the opponents, start. */
function openSheet(entry) {
  app.sheet = { entry, difficulty: app.settings.difficulty ?? "normal", seed: randomSeed() };
  renderSheet();
}

function renderSheet() {
  const sheet = app.sheet;
  if (!sheet) return;
  const opponents = previewOpponents({ tags: sheet.entry.tags, seed: sheet.seed, difficulty: sheet.difficulty, roster: app.roster });
  const badge = boardBadge(sheet.entry, storage.loadPlayed());
  renderDifficultySheet(app.el.sheet, { entry: sheet.entry, difficulty: sheet.difficulty, opponents, badge: badge.played ? badge.text : "" }, {
    onDifficulty: (id) => { sheet.difficulty = id; renderSheet(); },
    onShuffle: () => { sheet.seed = randomSeed(); renderSheet(); },
    onStart: () => {
      app.settings.difficulty = sheet.difficulty;
      storage.saveSettings(app.settings);
      closeSheet();
      const start = () => startGame(sheet.entry.id, sheet.difficulty, sheet.seed);
      if (storage.tutorialSeen()) start();
      else openTutorial(start); // first game ever: the four how-to cards first
    },
    onClose: closeSheet,
  });
}

function closeSheet() {
  app.sheet = null;
  app.el.sheet.hidden = true;
  app.el.sheet.replaceChildren();
}

/** The how-to cards. `then` runs when they close (starting the first game), or null. */
function openTutorial(then) {
  app.tutorial = { step: 0, then };
  renderTutorialNow();
}

function renderTutorialNow() {
  const t = app.tutorial;
  if (!t) return;
  const close = () => {
    storage.markTutorialSeen();
    app.tutorial = null;
    app.el.tutorial.hidden = true;
    app.el.tutorial.replaceChildren();
    if (t.then) t.then();
  };
  renderTutorial(app.el.tutorial, { step: t.step }, {
    onStep: (n) => { t.step = n; renderTutorialNow(); },
    onSkip: close,
    onDone: close,
  });
}

async function startGame(boardId, difficulty, seed = randomSeed()) {
  app.el.quickPlay.disabled = true;
  try {
    const board = await fetch(`./boards/${boardId}.json`).then((r) => r.json());
    const state = createGame({ board, seed, difficulty, roster: app.roster, playerName: app.settings.playerName });
    beginGame(state);
    showIntro();
  } finally {
    app.el.quickPlay.disabled = false;
  }
}

/** Installs a game state (new or loaded) as the live game and shows the game screen. */
function beginGame(state) {
  app.state = state;
  app.summary = null;
  app.ctx = { bubbles: {}, flash: {}, lastResult: null, wager: null, nudge: false, drawing: null };
  clearTimers();
  app.lastClueKey = "";
  app.lastBoardKey = "";
  hideBand();
  app.el.gameTitle.textContent = state.board.title;
  location.hash = "#game";
  render();
}

/** Resume: the game saved after the last clue (a game in progress in this tab wins over the save). */
function resumeGame() {
  if (app.state && app.state.phase !== "results") { location.hash = "#game"; render(); afterAction(); return; }
  const saved = storage.loadGame();
  if (!saved) { app.el.resume.hidden = true; return; }
  beginGame(saved);
  app.revealBoard = true;
  render();
  afterAction();
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
}

/** The game is over: fold it into the career stats, drop the save, show the results. */
function finishGame() {
  const state = app.state;
  if (!state || state.phase !== "results") return;
  if (!app.summary) {
    app.summary = summarize(state);
    storage.saveStats(storage.recordGame(storage.loadStats(), app.summary));
    storage.markPlayed(state.boardId, app.summary.playerScore);
    storage.clearGame();
  }
  renderResults(app.el.results, app.summary, {
    onPlayAgain: () => { location.hash = "#home"; quickPlay(); },
    onLibrary: () => { location.hash = "#library"; },
    onHome: () => { location.hash = "#home"; },
  }, { libraryEnabled: true });
  location.hash = "#results";
}

// ---------------------------------------------------------------------------
// Library and Stats screens (paper panels, re-rendered each time they open)
// ---------------------------------------------------------------------------

function renderLibraryScreen() {
  if (!app.index) return; // the index is still loading; boot() renders once it lands
  renderLibrary(app.el.library, { index: app.index, played: storage.loadPlayed(), pack: app.library.pack }, {
    onPack: (pack) => { app.library.pack = pack; renderLibraryScreen(); },
    onPick: (entry) => openSheet(entry),
    onHome: () => { location.hash = "#home"; },
  });
}

// ---------------------------------------------------------------------------
// Practice (src/practice.js is the engine; ui/practice.js the card)
// ---------------------------------------------------------------------------

function renderPracticeScreen() {
  const p = app.practice;
  if (p.state) {
    const key = practiceRenderKey(p.state);
    if (key === p.lastKey) return;
    p.lastKey = key;
    renderPracticeClue(app.el.practice, p.state, practiceHandlers);
    return;
  }
  p.lastKey = "";
  renderPracticeSetup(app.el.practice, { mode: p.mode, loading: p.loading, error: p.error }, {
    onMode: (mode) => { p.mode = mode; renderPracticeScreen(); },
    onStart: startPractice,
  });
}

/** Loads every board once, pools their clues, and starts the drill. */
async function startPractice() {
  const p = app.practice;
  if (!app.index || p.loading) return;
  p.loading = true;
  p.error = null;
  renderPracticeScreen();
  try {
    if (!p.clues) {
      const boards = await Promise.all(app.index.boards.map((b) => fetch(`./boards/${b.id}.json`).then((r) => r.json())));
      p.clues = boards.flatMap(cluesFromBoard);
    }
    p.state = createPractice({ clues: p.clues, seed: randomSeed(), mode: p.mode, roster: app.roster });
    practiceAct({ type: "start" });
  } catch (error) {
    p.error = "Could not load the clues. Check your connection and try again.";
    console.error(error);
  } finally {
    p.loading = false;
    if (screenFromHash(location.hash) === "practice") renderPracticeScreen();
  }
}

function stopPractice() {
  app.practice.state = null;
  app.practice.lastKey = "";
}

function practiceAct(action) {
  const state = app.practice.state;
  if (!state) return;
  dispatchPractice(state, { now: now(), ...action });
  for (const event of state.lastEvents) onPracticeEvent(event);
  renderPracticeScreen();
}

function onPracticeEvent(event) {
  switch (event.type) {
    case "open": audio.play("goLight"); break;
    case "lockout": audio.play("lockout"); break;
    case "won": audio.play("buzzIn"); break;
    case "resolved":
      if (event.winner) audio.play("buzzIn");
      if (event.winner === "you") audio.play("correct");
      else if (event.winner === "cpu") audio.play(event.correct ? "wrong" : "correct");
      break;
    case "answered": audio.play(event.correct ? "correct" : "wrong"); break;
    default: break;
  }
}

const practiceHandlers = {
  onBuzz: () => practiceAct({ type: "buzz" }),
  onAnswer: (text) => practiceAct({ type: "answer", text }),
  onRule: (correct) => practiceAct({ type: "rule", correct }),
  onNext: () => practiceAct({ type: "next" }),
  onStop: () => { stopPractice(); renderPracticeScreen(); },
};

/** Called every frame while a drill is running. */
function practiceFrame() {
  const state = app.practice.state;
  if (!state) return;
  practiceAct({ type: "tick" });
  const c = state.clue;
  if (c?.state === "resolved" && now() >= c.nextAt) practiceAct({ type: "next" });
  updatePracticeTimers(app.el.practice, state, now());
}

function renderStatsScreen() {
  renderStats(app.el.stats, storage.loadStats(), {
    onReset: () => {
      if (!app.statsConfirm) { app.statsConfirm = true; renderStatsScreen(); return; }
      storage.resetStats();
      app.statsConfirm = false;
      renderStatsScreen();
    },
    onCancel: () => { app.statsConfirm = false; renderStatsScreen(); },
    onHome: () => { location.hash = "#home"; },
  }, { confirming: app.statsConfirm });
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
      audio.play("boardReveal");
      break;
    case "clue.select":
      audio.play(event.dailyDouble ? "dailyDouble" : "categoryPop");
      break;
    case "buzzers.open":
      audio.play("goLight");
      break;
    case "lockout":
      flash(event.contestant, "lockout", 600);
      if (state.contestants[event.contestant].isHuman) audio.play("lockout");
      break;
    case "buzz":
      if (!state.contestants[event.contestant].isHuman) bubble(event.contestant, "…", 0);
      audio.play("buzzIn");
      break;
    case "score": {
      startCountUp(event.contestant, event.delta);
      if (event.kind === "final") break;
      app.ctx.lastResult = event;
      flash(event.contestant, event.correct ? "correct" : "wrong", 900);
      audio.play(event.correct ? "correct" : "wrong");
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
      audio.play("roundEnd");
      showBand(`
        <h2 class="band__title">End of ${state.board.rounds[event.round].name}</h2>
        <p>${event.scores.map((s, i) => `${escapeHtml(names[i])}: ${formatScore(s)}`).join(" · ")}</p>
        ${event.round + 1 < state.board.rounds.length
          ? `<p>Values are doubled in ${escapeHtml(state.board.rounds[event.round + 1].name)}. The contestant with the lowest score picks first.</p>`
          : `<p>On to the Final.</p>`}
      `, "Continue", () => act({ type: "next" }));
      break;
    case "final.start":
      hideBand();
      if (!event.eligible.length) {
        showBand(`<h2 class="band__title">No Final today</h2><p>Nobody finished above zero, so there is no Final round.</p>`, "See the results", () => finishGame());
      }
      break;
    case "final.clue":
      audio.startFinalMusic();
      break;
    case "final.answered":
      audio.stopFinalMusic();
      break;
    case "final.reveal":
      flash(event.contestant, event.correct ? "correct" : "wrong", 900);
      audio.play(event.correct ? "correct" : "wrong");
      break;
    case "game.end":
      audio.stopFinalMusic();
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

/**
 * Podium scores count up or down over half a second instead of jumping.
 * `app.ctx.display` holds the numbers currently shown; the frame loop moves
 * them toward the real scores. Skipped when the user prefers reduced motion.
 */
function startCountUp(index, delta) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !delta) { app.ctx.display = null; return; }
  const scores = app.state.contestants.map((c) => c.score);
  const display = app.ctx.display ? app.ctx.display.slice() : scores.slice();
  display[index] = scores[index] - delta;
  app.ctx.display = display;
  app.countUp = { from: display.slice(), to: scores, start: now(), duration: 550 };
}

function stepCountUp() {
  const anim = app.countUp;
  if (!anim || !app.state) return;
  const t = Math.min(1, (now() - anim.start) / anim.duration);
  const eased = 1 - (1 - t) * (1 - t);
  app.ctx.display = anim.from.map((v, i) => Math.round(v + (anim.to[i] - v) * eased));
  for (const el of app.el.podiums.querySelectorAll(".podium")) {
    const i = Number(el.dataset.index);
    const scoreEl = el.querySelector(".podium__score");
    if (scoreEl) scoreEl.textContent = formatScore(app.ctx.display[i]);
  }
  if (t >= 1) { app.countUp = null; app.ctx.display = null; }
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

const finalHandlers = {
  onNext: () => act({ type: "next" }),
  onWager: (amount) => { app.ctx.wager = null; act({ type: "finalWager", amount }); },
  onWagerChange: (amount) => { app.ctx.wager = amount; render(); },
  onDone: () => act({ type: "finalAnswer" }),
  onRule: (correct) => act({ type: "finalRule", correct }),
  onDrawingChange: (dataUrl) => { app.ctx.drawing = dataUrl; },
  onResults: () => finishGame(),
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
  const inFinal = state.final && (state.phase === "final" || state.phase === "results");
  const clueKey = inFinal ? finalRenderKey(state, app.ctx) : clueRenderKey(state, app.ctx);
  if (clueKey !== app.lastClueKey) {
    if (inFinal) renderFinal(app.el.clue, state, finalHandlers, app.ctx);
    else renderClue(app.el.clue, state, clueHandlers, app.ctx);
    app.lastClueKey = clueKey;
  }
  renderPodiumsNow();
  app.el.game.classList.toggle("game--clue", state.phase === "clue" || Boolean(inFinal));
}

function renderPodiumsNow() {
  if (app.state) renderPodiums(app.el.podiums, app.state, app.ctx);
}

/** One animation frame: tick the engine while a clue or the Final is live, move timer bars. */
function frame() {
  const state = app.state;
  stepCountUp();
  practiceFrame();
  if (state && (state.phase === "clue" || state.phase === "final")) {
    const before = state.clue?.state;
    dispatch(state, { type: "tick", now: now() });
    for (const event of state.lastEvents) onEvent(event);
    render(); // keyed, so this is cheap when nothing changed
    if (state.clue?.state !== before) afterAction();
    updateClueTimers(app.el.clue, state, now());
    updateFinalTimers(app.el.clue, state, now());
  }
  requestAnimationFrame(frame);
}

function onKeyDown(event) {
  if (event.code !== "Space") return;
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
  if (app.practice.state && screenFromHash(location.hash) === "practice") {
    event.preventDefault();
    practiceAct({ type: "buzz" });
    return;
  }
  if (!app.state || app.state.phase !== "clue") return;
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
