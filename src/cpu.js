// Computer contestants: how likely they are to know a clue, how fast they
// buzz, and how they wager. All randomness comes through the game's seeded
// rng so games replay. Numbers come from the build plan's opponent table.
//
// A contestant carries a `profile` with these fields (see data/opponents.json
// and POOLS below): knowsTop, knowsBottom, reactionMean, reactionSd,
// wrongBuzz, finalAccuracy, ddWager [lo, hi]. strongTags/weakTags shift the
// knowledge odds by ±15 % on categories carrying those tags.

import { gaussian, pick, random, randomInt, shuffle } from "./rng.js";

/** Pool defaults by difficulty. Row 0 is the top (easiest) row. */
export const POOLS = {
  easy:   { knowsTop: 0.60, knowsBottom: 0.25, reactionMean: 900, reactionSd: 250, wrongBuzz: 0.00, finalAccuracy: 0.40, ddWager: [0.40, 0.60] },
  normal: { knowsTop: 0.75, knowsBottom: 0.45, reactionMean: 600, reactionSd: 200, wrongBuzz: 0.03, finalAccuracy: 0.60, ddWager: [0.50, 0.80] },
  hard:   { knowsTop: 0.88, knowsBottom: 0.65, reactionMean: 380, reactionSd: 120, wrongBuzz: 0.06, finalAccuracy: 0.80, ddWager: [0.60, 1.00] },
};

export const TAG_BONUS = 0.15;
export const MIN_REACTION_MS = 120;

/** A full profile for a roster entry: pool numbers, overridden by any the entry sets. */
export function profileFor(entry) {
  const pool = POOLS[entry.pool] ?? POOLS.normal;
  return { ...pool, ...(entry.profile ?? {}) };
}

/**
 * Chance a contestant knows a clue on `row` (0 = top, 4 = bottom) in a
 * category with `tags`. Round 2 uses the same curve by row, not by value.
 */
export function knowsProbability(contestant, row, tags = []) {
  const p = contestant.profile;
  let chance = p.knowsTop + ((p.knowsBottom - p.knowsTop) * row) / 4;
  if (tags.some((t) => contestant.strongTags?.includes(t))) chance += TAG_BONUS;
  if (tags.some((t) => contestant.weakTags?.includes(t))) chance -= TAG_BONUS;
  return Math.min(0.98, Math.max(0.02, chance));
}

export function rollKnows(rng, contestant, row, tags) {
  return random(rng) < knowsProbability(contestant, row, tags);
}

/** Buzz reaction after the go-light, in ms (never faster than MIN_REACTION_MS). */
export function rollReaction(rng, contestant) {
  const p = contestant.profile;
  return Math.max(MIN_REACTION_MS, Math.round(gaussian(rng, p.reactionMean, p.reactionSd)));
}

/** A contestant who does not know it may still buzz (Hard does this 6 % of the time). */
export function rollWrongBuzz(rng, contestant) {
  return random(rng) < contestant.profile.wrongBuzz;
}

export function rollFinalKnows(rng, contestant) {
  return random(rng) < contestant.profile.finalAccuracy;
}

/** Daily Double limits: at least 5, at most the larger of the score and the round's top value. */
export function dailyDoubleLimits(score, roundMax) {
  return { min: 5, max: Math.max(score, roundMax) };
}

/** CPU Daily Double wager: a fraction of the maximum by profile, rounded to 100s. */
export function dailyDoubleWager(rng, contestant, score, roundMax) {
  const { min, max } = dailyDoubleLimits(score, roundMax);
  const [lo, hi] = contestant.profile.ddWager;
  const fraction = lo + random(rng) * (hi - lo);
  let amount = Math.round((fraction * max) / 100) * 100;
  if (amount < 100) amount = Math.min(100, max);
  return Math.min(max, Math.max(min, amount));
}

/**
 * CPU Final wager. The leader covers second place doubling up (2 × second
 * + 1 − own score); trailers go big. A little jitter keeps it unpredictable.
 * `scores` are all contestants' scores going into the Final.
 */
export function finalWager(rng, contestant, scores, selfIndex) {
  const score = scores[selfIndex];
  if (score <= 0) return 0;
  const others = scores.filter((_, i) => i !== selfIndex);
  const topOther = Math.max(...others);
  let wager;
  if (score > topOther) {
    // leader: just enough to stay ahead if second place doubles
    wager = 2 * topOther + 1 - score;
    if (wager < 0) wager = 0; // runaway: nothing to cover
    wager += randomInt(rng, 0, Math.floor(score * 0.05));
  } else {
    // trailing or tied: go big
    wager = Math.round(score * (0.7 + random(rng) * 0.3));
  }
  return Math.min(score, Math.max(0, Math.round(wager)));
}

/**
 * Picks two opponents from a roster for the difficulty, giving each a strong
 * and a weak category tag drawn from the board's tags so they feel different.
 * Returns contestant objects ready for the game state.
 */
export function pickOpponents(rng, roster, difficulty, boardTags = []) {
  const pool = roster.filter((entry) => entry.pool === difficulty);
  const source = pool.length >= 2 ? pool : roster;
  const chosen = shuffle(rng, source).slice(0, 2);
  const colours = ["cpu-a", "cpu-b"];
  return chosen.map((entry, i) => {
    const tags = shuffle(rng, boardTags);
    return {
      id: entry.id,
      name: entry.name,
      bio: entry.bio ?? "",
      colour: colours[i],
      isHuman: false,
      pool: entry.pool,
      profile: profileFor(entry),
      strongTags: tags.length ? [tags[0]] : [],
      weakTags: tags.length > 1 ? [tags[1]] : [],
      score: 0,
    };
  });
}

/** For simulations: a stand-in human that plays like a pool contestant. */
export function simulatedHuman(pool = "normal") {
  return { profile: { ...POOLS[pool] }, strongTags: [], weakTags: [] };
}

export { pick };
