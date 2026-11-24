// Game state and saves. Story money and side money are separate ledgers and
// never mix: story payouts retire the debt, side cash is what fines and shops touch.
import { RANKS, SAVE_KEY, STORY_PAYOUTS, WEAPONS } from './config.js';

export function createState() {
  return {
    screen: 'title', // title | play | over (over = slam/fade sequence running)
    hour: 17.4,
    cash: 600, // side money
    storyPaid: 0, // story ledger: sum of finished job payouts
    jobIndex: 0, // next story job
    lifetime: 0, // all earnings, drives respect ranks
    health: 100,
    heat: 0, stars: 0, bust: 0, unseenFor: 99, bustWarned: false,
    combo: { mult: 1, score: 0, timer: 0 },
    standing: [0, 0, 0, 0, 0, 0],
    properties: [false, false, false],
    rentTimer: 0,
    garageCar: null, // {model, color, mods} stored across saves
    stashesTaken: [],
    bountyDone: {}, // index -> respawn time left
    weapons: WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve })),
    weapon: -1, // drawn weapon index, -1 holstered
    photos: 0, photoDrops: 0, carjacks: 0, jobsDone: 0,
    helpSeen: false,
    playSeconds: 0,
  };
}
/** Story pay: retires debt only. */
export function payStory(s, amount) {
  s.storyPaid += amount;
  s.lifetime += amount;
}
/** Side pay: spendable cash from gigs, stashes, races and the rest. */
export function paySide(s, amount) {
  s.cash += amount;
  if (amount > 0) s.lifetime += amount;
}
export function rankFor(lifetime) {
  let name = RANKS[0][1];
  for (const [need, rank] of RANKS) if (lifetime >= need) name = rank;
  return name;
}
export function debtLeft(s) {
  return Math.max(0, STORY_PAYOUTS.reduce((a, b) => a + b, 0) - s.storyPaid);
}
export function saveGame(s, world) {
  try {
    const data = {
      cash: s.cash, storyPaid: s.storyPaid, jobIndex: s.jobIndex, lifetime: s.lifetime,
      standing: s.standing, properties: s.properties, garageCar: s.garageCar,
      stashesTaken: s.stashesTaken, weapons: s.weapons, photos: s.photos,
      photoDrops: s.photoDrops, carjacks: s.carjacks, jobsDone: s.jobsDone,
      px: world.px, pz: world.pz, hour: s.hour,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
}
export function applySave(s, data) {
  if (!data) return;
  for (const k of ['cash', 'storyPaid', 'jobIndex', 'lifetime', 'photos', 'photoDrops', 'carjacks', 'jobsDone', 'hour'])
    if (typeof data[k] === 'number') s[k] = data[k];
  if (Array.isArray(data.standing)) s.standing = data.standing;
  if (Array.isArray(data.properties)) s.properties = data.properties;
  if (Array.isArray(data.stashesTaken)) s.stashesTaken = data.stashesTaken;
  if (Array.isArray(data.weapons)) s.weapons = data.weapons;
  s.garageCar = data.garageCar ?? null;
}
