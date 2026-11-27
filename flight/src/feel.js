// Game feel: the moment-to-moment feedback for the actions the sim already has —
// the stall buffet, the touchdown jolt and dust, the ring pulse, the speed in the
// lens, the prop's effort. Every function here is a pure function of the flight
// state and its clock (state.elapsed and the event records the model keeps): no
// wall clock, no randomness, so a frame is the same whenever it is drawn. Sizes
// and rates all come from FEEL in config.js, under one master scale.
import { FEEL, PLANE, RPM } from './config.js';

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/** 0 clear of the buffet, 1 at the stall: how deep into the buffet the wing is. */
export function stallProximity(state) {
  if (state.onGround || state.end !== '') return 0;
  const stall = state.stallSpeed ?? PLANE.stallSpeed;
  const top = stall * FEEL.buffetStartRatio;
  if (state.speed >= top) return 0;
  return clamp((top - state.speed) / (top - stall), 0, 1);
}

/**
 * The buffet shake, in frame pixels: two waveforms beating against each other
 * so it never settles into a visible rhythm, hard-capped by construction —
 * each axis is the amplitude times two sines, and sines never pass 1.
 */
export function buffetOffset(state) {
  const proximity = stallProximity(state);
  if (proximity <= 0) return { x: 0, y: 0 };
  const amp = FEEL.master * FEEL.buffetMaxPx * Math.pow(proximity, 1.5);
  const t = state.elapsed;
  return {
    x: amp * Math.sin(t * FEEL.buffetRateA) * Math.sin(t * FEEL.buffetRateC),
    y: amp * Math.sin(t * FEEL.buffetRateB + 0.9) * Math.sin(t * FEEL.buffetRateD),
  };
}

/** How hard the last touchdown was: 0 for a greaser, 1 for a full arrival. */
export function touchdownSeverity(state) {
  const sink = Math.max(0, -(state.touchSink ?? 0));
  return clamp((sink - FEEL.joltSinkSoft) / (FEEL.joltSinkHard - FEEL.joltSinkSoft), 0, 1);
}

/** Seconds since the wheels last touched, Infinity when they never have. */
export function touchdownAge(state) {
  if (state.touchAt === undefined || state.touchAt < 0) return Infinity;
  return state.elapsed - state.touchAt;
}

/**
 * The touchdown jolt, in frame pixels: a damped bounce that dies inside a
 * second. `ageOverride` lets the renderer pace the jolt by frames on the end
 * screen, where the sim clock has stopped (see render.js's surrogate clock).
 */
export function joltOffset(state, ageOverride) {
  const age = ageOverride === undefined ? touchdownAge(state) : ageOverride;
  if (!(age >= 0) || age > FEEL.joltSeconds) return { x: 0, y: 0 };
  const severity = touchdownSeverity(state);
  if (severity <= 0) return { x: 0, y: 0 };
  const envelope = Math.exp(-FEEL.joltDecay * age) * Math.sin(FEEL.joltRate * age);
  const amp = FEEL.master * FEEL.joltMaxPx * severity;
  return { x: amp * 0.3 * envelope * Math.sin(age * 23), y: amp * envelope };
}

/**
 * The touchdown dust: puffs drifting off the contact point, or null once they
 * have blown away. Each puff's spread comes from a fixed hash of its index, so
 * the pattern is the same every time the same touchdown is drawn.
 */
export function dustPuffs(state, ageOverride) {
  const age = ageOverride === undefined ? touchdownAge(state) : ageOverride;
  if (!(age >= 0) || age > FEEL.dustSeconds) return null;
  const t = age / FEEL.dustSeconds;
  const fadeIn = age <= 0 ? 0 : Math.min(1, age / 0.08);
  const puffs = [];
  for (let index = 0; index < FEEL.dustCount; index += 1) {
    const hash = ((index * 37) % 10) / 10;
    const angle = index * 2.399963 + hash;
    const drift = FEEL.dustGrowMetres * (0.3 + 0.7 * hash) * (1 - Math.pow(1 - t, 2));
    puffs.push({
      x: state.touchX + Math.cos(angle) * drift,
      y: state.touchY + Math.sin(angle) * drift,
      r: 2.5 + 8 * t * (0.6 + 0.4 * hash),
      alpha: 0.26 * Math.pow(1 - t, 1.4) * fadeIn,
    });
  }
  return puffs;
}

/** The pulse on the ring just flown through: { index, t } with t 0..1, or null. */
export function ringPulse(state, ageOverride) {
  if (state.ringAt === undefined || state.ringAt < 0 || state.ringIndex < 0) return null;
  const age = ageOverride === undefined ? state.elapsed - state.ringAt : ageOverride;
  if (age < 0 || age > FEEL.ringPulseSeconds) return null;
  return { index: state.ringIndex, t: age / FEEL.ringPulseSeconds };
}

/** The ring counter's pop: a scale that starts swollen and settles to 1. */
export function counterPop(state) {
  if (state.ringAt === undefined || state.ringAt < 0) return 1;
  const age = state.elapsed - state.ringAt;
  if (age < 0 || age > FEEL.counterPopSeconds) return 1;
  const left = 1 - age / FEEL.counterPopSeconds;
  return 1 + FEEL.counterPopScale * left * left;
}

/** Extra lens, in degrees, that airspeed buys: dives feel fast, finals stay calm. */
export function speedFovExtra(state) {
  const frac = clamp(state.speed / PLANE.maxSpeed, 0, 1);
  return FEEL.master * FEEL.fovMaxExtraDeg * Math.pow(frac, 1.6);
}

/** 0 with the engine stopped, 1 at full rpm: how hard the prop is working. */
export function propBlend(state) {
  return clamp((state.rpm ?? 0) / RPM.full, 0, 1);
}

/**
 * The end screen's landing pulse, from a count of frames drawn on that screen.
 * The sim clock stops when the sortie ends, so the banner's settle is paced by
 * frames instead — never by a clock read, and the screenshot scenes draw the
 * screen once, unpulsed.
 */
export function bannerPulseScale(frames) {
  const seconds = frames / 60;
  if (seconds >= FEEL.bannerPulseSeconds) return 1;
  return 1 + FEEL.bannerPulseScale * Math.exp(-5 * seconds) * Math.cos(14 * seconds);
}
