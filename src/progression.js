// Progression: the two money ledgers (story payouts retire the debt; side
// cash is spendable), respect ranks, district standing, the style combo,
// the crew, and the localStorage save. Story money and side money never
// mix: payStory and paySide are the only doors, and shops only spend side.

import {
  CREW_COOLDOWN_SECONDS, DEBT, DISTRICTS, RANKS, SAVE_KEY, STANDING_LEVELS,
  STYLE_EVENTS, STYLE_MAX_MULT,
} from './config.js';

const STYLE_WINDOW_SECONDS = 5;
const STYLE_POOL_PER_MULT = 220;

export function createProgression() {
  const fresh = () => ({
    storyIndex: 0,
    storyEarned: 0,
    sideCash: 0,
    lifetime: 0,
    standing: Object.fromEntries(DISTRICTS.map((d) => [d.id, 0])),
    stashes: Array(20).fill(false),
    properties: [],
    garage: null,
    lastCar: null,
    contractIndex: 0,
    gigCount: 0,
    stats: { carjacks: 0, photos: 0, dronePhotos: 0, racesWon: 0, racesRun: 0, bounties: 0, contracts: 0, gigs: 0, shotsFired: 0 },
  });
  let state = fresh();
  let stylePool = 0;
  let styleTimer = 0;
  let crewTimer = 0;
  let crewCar = null;

  const api = {
    get state() { return state; },
    get stylePool() { return stylePool; },
    get styleMult() { return Math.min(STYLE_MAX_MULT, 1 + Math.floor(stylePool / STYLE_POOL_PER_MULT)); },
    get styleTimer() { return styleTimer; },
    debtLeft: () => Math.max(0, DEBT - state.storyEarned),
    rank() {
      let rank = RANKS[0];
      for (const r of RANKS) if (state.lifetime >= r.at) rank = r;
      return rank;
    },
    nextRank() {
      return RANKS.find((r) => state.lifetime < r.at) ?? null;
    },
    standingLevel(district) {
      const pts = state.standing[district] ?? 0;
      let level = 0;
      STANDING_LEVELS.forEach((need, i) => { if (pts >= need) level = i; });
      return level;
    },
    addStanding(district, points) {
      if (district in state.standing) state.standing[district] += points;
    },
    /** Story payouts: retire debt and build respect, never spendable. */
    payStory(amount) {
      state.storyEarned += amount;
      state.lifetime += amount;
    },
    /** Side money: spendable cash; also builds respect and local standing. */
    paySide(amount, district) {
      state.sideCash += amount;
      state.lifetime += amount;
      if (district) api.addStanding(district, Math.max(2, Math.round(amount / 60)));
    },
    spendSide(amount) {
      if (state.sideCash < amount) return false;
      state.sideCash -= amount;
      return true;
    },
    /** Feed the style combo: near misses, drift seconds, airtime seconds. */
    addStyle(kind, amount = 1) {
      const per = STYLE_EVENTS[kind] ?? 0;
      stylePool += per * amount * api.styleMult;
      styleTimer = STYLE_WINDOW_SECONDS;
    },
    /** A hard crash throws the pooled style away. */
    bustStyle() {
      stylePool = 0;
      styleTimer = 0;
    },
    crewReady: () => crewTimer <= 0 && !crewCar,
    crewCooldown: () => Math.max(0, crewTimer),
    /**
     * Per-step tick. hooks: onStyleBanked(cash), onRentDue handled by the
     * properties module. Crew driving needs the world: handled in updateCrew.
     */
    update(dt, hooks) {
      if (styleTimer > 0) {
        styleTimer -= dt;
        if (styleTimer <= 0 && stylePool > 0) {
          const cash = Math.round(stylePool / 4);
          stylePool = 0;
          if (cash > 0) {
            api.paySide(cash);
            if (hooks?.onStyleBanked) hooks.onStyleBanked(cash);
          }
        }
      }
      crewTimer = Math.max(0, crewTimer - dt);
    },
    /** Dario arrives in a Royale and leans on any cruiser near the player. */
    callCrew(vehicles, focus) {
      if (!api.crewReady()) return null;
      const angle = Math.random() * Math.PI * 2;
      crewCar = vehicles.spawnCar('royale', focus.x + Math.sin(angle) * 26, focus.z + Math.cos(angle) * 26, angle, 'crew', { color: 0x14181f });
      crewTimer = CREW_COOLDOWN_SECONDS;
      return crewCar;
    },
    updateCrew(dt, vehicles, focus, cruisers, hooks) {
      if (!crewCar) return;
      if (crewCar.dead) {
        vehicles.removeCar(crewCar);
        crewCar = null;
        return;
      }
      let threat = null;
      let threatDist = 16;
      for (const cruiser of cruisers) {
        if (cruiser.dead) continue;
        const d = Math.hypot(cruiser.x - focus.x, cruiser.z - focus.z);
        if (d < threatDist) {
          threatDist = d;
          threat = cruiser;
        }
      }
      if (threat) {
        vehicles.steerToward(crewCar, threat.x, threat.z, dt, { speedScale: 1.0 });
        const d = Math.hypot(crewCar.x - threat.x, crewCar.z - threat.z);
        if (d < 3.4) {
          threat.slipX += (threat.x - crewCar.x) * 2.4;
          threat.slipZ += (threat.z - crewCar.z) * 2.4;
          threat.speed *= 0.4;
          vehicles.damageCar(threat, 6);
          if (hooks?.onCrewShove) hooks.onCrewShove();
        }
      } else {
        const d = vehicles.steerToward(crewCar, focus.x, focus.z, dt, { speedScale: 0.85, slowRadius: 10 });
        if (d < 6) crewCar.speed *= 0.8;
      }
    },
    dismissCrew(vehicles) {
      if (crewCar) {
        vehicles.removeCar(crewCar);
        crewCar = null;
      }
    },
    // ------------------------------------------------------------ saves
    save() {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      } catch {
        // Storage can be off (private windows): the run then lasts this visit only.
      }
    },
    hasSave() {
      try {
        return window.localStorage.getItem(SAVE_KEY) !== null;
      } catch {
        return false;
      }
    },
    load() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        state = { ...fresh(), ...parsed, stats: { ...fresh().stats, ...(parsed.stats ?? {}) }, standing: { ...fresh().standing, ...(parsed.standing ?? {}) } };
        return true;
      } catch {
        return false;
      }
    },
    wipe() {
      state = fresh();
      stylePool = 0;
      styleTimer = 0;
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch { /* ignore */ }
    },
  };
  return api;
}
