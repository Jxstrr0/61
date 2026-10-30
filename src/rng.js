// Seeded random numbers (mulberry32), so a board + seed replays identically.
//
// The generator's whole state is one 32-bit integer kept in a plain object,
// which means it can live inside the game state and be saved to
// localStorage and restored without any special handling.
//
//   const rng = createRng(42);
//   random(rng)        -> 0 ≤ x < 1
//   randomInt(rng, 1, 6)
//   pick(rng, list)
//   gaussian(rng, 600, 200)

/** Makes a generator from a seed (any number or numeric string). */
export function createRng(seed) {
  const s = (Number(seed) >>> 0) || 0x9e3779b9; // seed 0 would be a dead generator
  return { seed: s, s };
}

/** Next number in [0, 1). Advances the generator in place. */
export function random(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer from min to max, both inclusive. */
export function randomInt(rng, min, max) {
  return min + Math.floor(random(rng) * (max - min + 1));
}

/** One item of a non-empty array. */
export function pick(rng, list) {
  return list[Math.floor(random(rng) * list.length)];
}

/** Normal (bell-curve) sample via Box-Muller. */
export function gaussian(rng, mean, sd) {
  let u = 0;
  while (u === 0) u = random(rng); // avoid log(0)
  const v = random(rng);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(rng) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A seed from the clock, for games the player does not seed. */
export function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
