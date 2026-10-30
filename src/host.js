// The host's brain, with no DOM in it: given an engine event (and the game
// state it came from), decide what the host says and which face they pull.
// The UI (src/ui/host.js) only draws what this returns. Keeping the words
// here means they are unit-tested and the host never makes a rules call:
// everything it knows comes from events the engine already logged.
//
// The host is silent text: a short line in a speech balloon, nothing spoken.

import { findClue } from "./game.js";

/** Every face the host can pull. The stylesheet has a class per mood. */
export const HOST_MOODS = ["idle", "talking", "listening", "happy", "sad", "surprised", "serious", "proud"];

/** A tiny deterministic picker so the same game replays with the same lines. */
function pick(list, salt) {
  return list[Math.abs(salt) % list.length];
}

const LINES = {
  welcome: ["Welcome to 61. Let's play.", "Good to see you. Three podiums, one board, let's go.", "Lights up. Here we go."],
  yourPick: ["Your board.", "Pick a clue.", "You have the board."],
  theirPick: (name) => [`${name} has the board.`, `${name}'s pick.`, `Over to ${name}.`],
  reading: ["Here's your clue.", "Read along.", "Wait for the light."],
  buzzYou: ["Yes?", "Go ahead.", "You're in."],
  buzzThem: (name) => [`${name}.`, `${name}, go ahead.`, `Yes, ${name}?`],
  correctYou: ["That's it.", "Right you are.", "Yes! Well done.", "Correct."],
  correctThem: (name) => [`${name} has it.`, `That's right, ${name}.`, `Correct, ${name}.`],
  wrongYou: ["No, sorry.", "Not that one.", "Afraid not."],
  wrongThem: (name) => [`No, ${name}.`, `Sorry, ${name}.`, `${name}, that's not it.`],
  nobody: (answer) => [`Nobody? It was ${answer}.`, `The answer was ${answer}.`, `We were looking for ${answer}.`],
  early: ["Too early. Wait for the light.", "Jumped the light.", "Hold on, not yet."],
  dailyDouble: ["You found a Daily Double!", "A Daily Double! Name your wager.", "There it is: a Daily Double."],
  dailyDoubleThem: (name) => [`${name} found a Daily Double.`, `A Daily Double for ${name}.`],
  roundEnd: ["That's the round.", "End of the round. Take a breath.", "And that's the board."],
  finalCategory: ["Here is the Final category.", "One clue left. Think about your wager.", "Final time. Here's the category."],
  finalClue: ["Thirty seconds. Write your answer.", "Here's your Final clue. Good luck.", "Last clue. Take your time."],
  finalReveal: ["Let's see what everyone wrote.", "Time's up. To the podiums."],
  win: ["You win! What a game.", "Our champion!", "You did it. Congratulations."],
  lose: (name) => [`${name} takes it. Good game.`, `Tonight's winner: ${name}.`, `Well played. ${name} wins.`],
  nudge: ["In the form of a question, please.", "Remember: \"What is…\""],
};

/**
 * @param {object} event   one entry from state.lastEvents
 * @param {object} state   the game state after the event
 * @returns {{mood: string, text: string, holdMs: number} | null}
 *   mood is one of HOST_MOODS; text may be "" to change the face without a
 *   line; holdMs is how long the line stays up (0 = until the next line).
 */
export function hostReact(event, state) {
  const salt = state.log?.length ?? 0;
  const names = state.contestants.map((c) => c.name);
  const human = state.contestants.findIndex((c) => c.isHuman);
  const isMe = (i) => i === human;

  switch (event.type) {
    case "game.start":
      return { mood: "happy", text: pick(LINES.welcome, salt), holdMs: 0 };
    case "round.start": {
      const you = isMe(event.controller);
      return { mood: "idle", text: you ? pick(LINES.yourPick, salt) : pick(LINES.theirPick(names[event.controller]), salt), holdMs: 0 };
    }
    case "clue.select": {
      if (event.dailyDouble) {
        const you = isMe(event.by);
        return { mood: "surprised", text: you ? pick(LINES.dailyDouble, salt) : pick(LINES.dailyDoubleThem(names[event.by]), salt), holdMs: 0 };
      }
      return { mood: "talking", text: pick(LINES.reading, salt), holdMs: 0 };
    }
    case "buzzers.open":
      return { mood: "listening", text: "", holdMs: 0 };
    case "lockout":
      return isMe(event.contestant) ? { mood: "sad", text: pick(LINES.early, salt), holdMs: 1800 } : null;
    case "buzz":
      return { mood: "listening", text: isMe(event.contestant) ? pick(LINES.buzzYou, salt) : pick(LINES.buzzThem(names[event.contestant]), salt), holdMs: 0 };
    case "nudge":
      return { mood: "talking", text: pick(LINES.nudge, salt), holdMs: 2500 };
    case "score": {
      if (event.kind === "final") return null;
      const you = isMe(event.contestant);
      if (event.correct) return { mood: "happy", text: you ? pick(LINES.correctYou, salt) : pick(LINES.correctThem(names[event.contestant]), salt), holdMs: 0 };
      return { mood: "sad", text: you ? pick(LINES.wrongYou, salt) : pick(LINES.wrongThem(names[event.contestant]), salt), holdMs: 0 };
    }
    case "clue.resolved": {
      if (event.answered) return null; // the score line already said it
      const info = state.board ? findClue(state.board, event.clueId) : null;
      const answer = info?.clue?.answer ?? "";
      return { mood: "serious", text: pick(LINES.nobody(answer), salt), holdMs: 0 };
    }
    case "round.end":
      return { mood: "idle", text: pick(LINES.roundEnd, salt), holdMs: 0 };
    case "final.start":
      return { mood: "serious", text: pick(LINES.finalCategory, salt), holdMs: 0 };
    case "final.clue":
      return { mood: "serious", text: pick(LINES.finalClue, salt), holdMs: 0 };
    case "final.answered":
      return { mood: "idle", text: pick(LINES.finalReveal, salt), holdMs: 0 };
    case "final.reveal":
      return { mood: event.correct ? "happy" : "sad", text: "", holdMs: 0 };
    case "game.end": {
      const won = event.winners.includes(human);
      const name = names[event.winners[0]];
      return { mood: won ? "proud" : "idle", text: won ? pick(LINES.win, salt) : pick(LINES.lose(name), salt), holdMs: 0 };
    }
    default:
      return null;
  }
}

/** What the host says while the Home screen is open (varies by career). */
export function hostGreeting(stats, salt = 0) {
  const games = stats?.games ?? 0;
  if (games === 0) return pick(["Hello! New here? Tap Quick Play.", "Welcome to the studio."], salt);
  if (games < 5) return pick(["Back for more? Good.", "Welcome back."], salt);
  return pick([`Game ${games + 1}. Let's make it count.`, "Our regular! Take your podium."], salt);
}
