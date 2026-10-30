// Plays a whole game with no UI: the human seat is driven by a pool
// profile (it buzzes when it "knows", types the right answer, wagers like
// a CPU). Used by the tests (1,000 seeded games) and by debug.html.

import { dispatch, createGame, chooseClueForCpu, findClue, summarize, scoresFromLog } from "./game.js";
import * as cpu from "./cpu.js";
import { random } from "./rng.js";

/**
 * @returns {{ state, summary, log }}
 */
export function simulateGame({ board, roster, seed, difficulty = "normal", humanPool = "normal", maxSteps = 5000 }) {
  const state = createGame({ board, roster, seed, difficulty });
  const human = cpu.simulatedHuman(humanPool);
  let now = 1000;
  const act = (action) => dispatch(state, { now, ...action });
  act({ type: "start" });

  for (let step = 0; step < maxSteps; step += 1) {
    if (state.phase === "results") break;

    if (state.phase === "board") {
      const id = chooseClueForCpu(state);
      now += 500;
      act({ type: "select", clueId: id });
      continue;
    }

    if (state.phase === "roundEnd") { now += 1000; act({ type: "next" }); continue; }

    if (state.phase === "clue") {
      const clue = state.clue;
      const me = 0;
      if (clue.state === "wager") {
        const amount = cpu.dailyDoubleWager(state.rng, human, state.contestants[me].score, 1000 * board.rounds[state.round].multiplier);
        act({ type: "wager", amount });
        continue;
      }
      if (clue.state === "reading") {
        now = clue.readingEndsAt;
        act({ type: "tick" });
        continue;
      }
      if (clue.state === "open") {
        const info = findClue(board, clue.id);
        if (!clue.attempted.includes(me) && !clue.humanPlan) {
          clue.humanPlan = { knows: cpu.rollKnows(state.rng, human, info.row, info.category.tags ?? []) };
          clue.humanPlan.buzzAt = clue.humanPlan.knows ? clue.openedAt + cpu.rollReaction(state.rng, human) : null;
        }
        const plan = clue.humanPlan;
        if (plan.knows && !clue.attempted.includes(me) && plan.buzzAt <= clue.windowEndsAt) {
          now = Math.max(now, plan.buzzAt);
          act({ type: "buzz" });
          if (clue.state === "open") { // lost the race by a tick? let time run
            now = clue.windowEndsAt;
            act({ type: "tick" });
          }
        } else {
          now = clue.windowEndsAt;
          act({ type: "tick" });
        }
        continue;
      }
      if (clue.state === "answering") {
        if (state.contestants[clue.answerer].isHuman) {
          const info = findClue(board, clue.id);
          const knows = clue.wager != null ? random(state.rng) < cpu.knowsProbability(human, info.row, info.category.tags ?? []) : clue.humanPlan?.knows;
          now += 2000;
          act({ type: "answer", text: knows ? info.clue.answer : "zzzz" });
        } else {
          now = clue.resolveAt;
          act({ type: "tick" });
        }
        continue;
      }
      if (clue.state === "ruling") { act({ type: "rule", correct: false }); continue; }
      if (clue.state === "resolved") { now += 1500; act({ type: "next" }); continue; }
    }

    if (state.phase === "final") {
      const f = state.final;
      if (f.stage === "category") { now += 1000; act({ type: "next" }); continue; }
      if (f.stage === "wager") {
        if (f.eligible.includes(0) && !(0 in f.wagers)) {
          act({ type: "finalWager", amount: cpu.finalWager(state.rng, human, f.entryScores, 0) });
        } else {
          act({ type: "next" });
        }
        continue;
      }
      if (f.stage === "clue") { now = f.thinkEndsAt; act({ type: "tick" }); continue; }
      if (f.stage === "ruling") { act({ type: "finalRule", correct: cpu.rollFinalKnows(state.rng, human) }); continue; }
      if (f.stage === "reveal") { now += 1000; act({ type: "next" }); continue; }
    }

    throw new Error(`simulation stuck in phase ${state.phase} / ${state.clue?.state ?? state.final?.stage}`);
  }

  if (state.phase !== "results") throw new Error("simulation did not finish");
  return { state, summary: summarize(state), log: state.log, scoresFromLog: scoresFromLog(state) };
}
