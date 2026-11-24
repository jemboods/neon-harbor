// Seeded RNG (mulberry32): the same seed always builds the same city.
/** Returns a function giving floats in [0, 1). */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Integer in [min, max] inclusive from rng. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}
/** Pick one element of list with rng. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
