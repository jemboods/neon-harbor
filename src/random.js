// Seeded randomness: one mulberry32 stream per world, so a seed always
// builds the same city and the same screenshot scenes.

/** Create a deterministic RNG from a 32-bit seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max]. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** One element of a non-empty array. */
    pick: (list) => list[Math.floor(next() * list.length)],
    /** True with probability p. */
    chance: (p) => next() < p,
  };
}
