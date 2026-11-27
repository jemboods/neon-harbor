// Every tuning number and colour for Archipelago Run, in one place. Distances are metres,
// speeds metres a second, angles radians unless a name says otherwise. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How long the how-to-fly guide stays up when a sortie starts, in seconds of flight time. */
export const GUIDE_SHOW_SECONDS = 10;

/** The seed the world is always grown from, so the archipelago (and the screenshots) repeat. */
export const WORLD_SEED = 20261126;

/** Half the world's width: the minimap spans -EXTENT..EXTENT on both axes. */
export const WORLD_EXTENT = 4200;

export const PLANE = {
  /** Throttle is a 0..1 lever; these are the speeds it can reach and the floor it stalls at. */
  maxSpeed: 70,
  /** Clean stall, 53 knots in metres a second; flaps bring it down toward 48. */
  stallSpeed: 27.3,
  /** Rotate speed, 55 knots: the ground roll lifts off at this with a pull. */
  rotateSpeed: 28.3,
  cruiseSpeed: 58,
  /** Full-throttle acceleration and the drag that balances it near maxSpeed. */
  thrustAccel: 13.5,
  dragQuad: 0.00276,
  /** How much of gravity acts along the flight path in a climb or dive. */
  gravityAlong: 8.4,
  /** Control authority: how fast roll and pitch chase what the pilot asks for. */
  rollRate: 2.8,
  pitchRate: 2.0,
  maxRoll: 1.12,
  maxPitchUp: 0.46,
  maxPitchDown: -0.52,
  /** Turn rate at full bank, radians a second; a coordinated turn does the rest. */
  turnGain: 1.02,
  /** Extra sink, metres a second, at zero airspeed in a full stall. */
  stallSink: 9.5,
  /** Camera: how far behind and above the plane it rides, and the lens. */
  camBack: 40,
  camUp: 13,
  camLookAhead: 150,
  fovDeg: 62,
};

export const FUEL = {
  capacity: 100,
  /** Burn a second: a base sip plus a throttle share. A cruise sortie lasts about five minutes. */
  burnBase: 0.13,
  burnThrottle: 0.36,
  lowWarning: 25,
};

/** Flaps, Cessna-style: four stops, each adding lift (a lower stall) and drag. */
export const FLAP = {
  steps: [0, 10, 20, 30],
  /** Stall speed falls by this share per degree: 53 knots clean to 48 at full flap. */
  stallPerDeg: 0.00314,
  /** Extra quadratic drag for every degree of flap. */
  dragPerDeg: 0.00004,
  /** How fast the flaps travel between stops, degrees a second. */
  transitRate: 12,
};

/** The tachometer: idle, the top of the green arc and the redline, revolutions a minute. */
export const RPM = { idle: 620, full: 2570, redline: 2700, greenFrom: 1900, greenTo: 2575 };

/** The airspeed indicator's painted arcs, in knots (Cessna 172S). */
export const ASI = {
  max: 170,
  whiteFrom: 40, whiteTo: 85,
  greenFrom: 48, greenTo: 129,
  yellowTo: 163,
  redline: 163,
};

export const WIND = {
  /** The sortie's steady wind, knots at most, and how hard the gusts breathe on top of it. */
  maxSteady: 9,
  gustAmp: 5.5,
  gustRate: 0.35,
};

export const RING = {
  radius: 55,
  /** Score a ring, plus a completion bonus and a per-second par bonus on a course. */
  points: 1000,
  finishBonus: 2000,
  parSecondPoints: 10,
};

export const LANDING = {
  /** Touchdown is a crash, not a landing, below this descent rate (metres a second). */
  crashSink: -11,
  /** The touchdown point the grade rewards: the aiming-point bars, 300 m past the threshold. */
  idealTouchdown: 300,
  spread: 260,
  /** Full alignment marks are lost by this much lateral offset or heading error. */
  lateralFull: 24,
  headingFull: 0.3,
  points: { alignment: 400, descent: 300, touchdown: 300 },
};

export const DAY = {
  /** Seconds of flight for one full dawn-noon-dusk cycle. */
  length: 300,
  /** Where a sortie starts on the cycle: morning light. */
  startPhase: 0.3,
};

/** Sky and sea keyframes over the day cycle; the renderer blends between neighbours. */
export const DAY_KEYS = [
  { phase: 0.0, skyTop: '#3a5a8c', skyHorizon: '#f2a65e', seaDeep: '#0b4a5c', seaFar: '#0f6e86', sun: 0.06, glow: 0.55 },
  { phase: 0.45, skyTop: '#2f7fc9', skyHorizon: '#bfe3f2', seaDeep: '#0e5a6d', seaFar: '#12809a', sun: 0.92, glow: 0.0 },
  { phase: 0.75, skyTop: '#2c3e70', skyHorizon: '#ff8c4a', seaDeep: '#0a4256', seaFar: '#0d5f74', sun: 0.1, glow: 1.0 },
  { phase: 1.0, skyTop: '#3a5a8c', skyHorizon: '#f2a65e', seaDeep: '#0b4a5c', seaFar: '#0f6e86', sun: 0.06, glow: 0.55 },
];

export const PALETTE = {
  seaDeep: '#0e5a6d',
  seaShallow: '#12809a',
  sand: '#e4d6a8',
  green: '#2e7d4f',
  greenDark: '#1f5c39',
  greenLight: '#3e9b63',
  rock: '#6b6f76',
  rockDark: '#4a4d52',
  crater: '#2e2a28',
  craterGlow: '#ff5a2a',
  runway: '#3c4147',
  runwayMark: '#f4f6f8',
  amber: '#ffb43a',
  navy: '#0b1c26',
  white: '#f4f6f8',
  cream: '#f2e7c9',
  panelLine: '#274b5c',
  text: '#ffffff',
  muted: '#9fb6c3',
  danger: '#ff6b57',
  good: '#51e39a',
  planeBody: '#f2f0e9',
  planeAccent: '#ffb43a',
  planeTrim: '#b3352b',
  canopy: '#12303f',
  cloud: '#ffffff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Unit flavour for the instruments: altitude in feet, speed in knots, sink in feet a minute. */
export const UNITS = { feetPerMetre: 3.281, knotsPerMs: 1.944, fpmPerMs: 196.85 };

/**
 * Game feel: every juice intensity in one place, all of it scaled by the one master,
 * so the whole pass can be toned down (or off) from a single number. The effects
 * themselves live in feel.js as pure functions of the flight state; these are only
 * the sizes, rates and windows they work to.
 */
export const FEEL = {
  master: 1,
  /** Stall buffet: fades in below stall speed times this, capped hard in pixels. */
  buffetStartRatio: 1.14,
  buffetMaxPx: 3.2,
  buffetRateA: 37,
  buffetRateB: 43,
  buffetRateC: 13.7,
  buffetRateD: 11.3,
  /** Touchdown jolt: a damped camera bounce scaled by the sink at contact. */
  joltMaxPx: 9,
  joltSeconds: 0.55,
  joltRate: 34,
  joltDecay: 7.5,
  joltSinkSoft: 1.2,
  joltSinkHard: 7.5,
  /** Touchdown dust: a handful of puffs drifting off the contact point. */
  dustSeconds: 0.9,
  dustCount: 7,
  dustGrowMetres: 15,
  /** Ring pass: an expanding pulse on the ring, and the counter's pop. */
  ringPulseSeconds: 0.5,
  ringPulseGrow: 0.45,
  counterPopSeconds: 0.35,
  counterPopScale: 0.3,
  /** Speed lens: extra field of view at full speed, eased so finals stay calm. */
  fovMaxExtraDeg: 4.5,
  /** The end screen's score and grade land with this much pulse, then settle. */
  bannerPulseSeconds: 0.6,
  bannerPulseScale: 0.28,
  /** Cockpit prop blur: alpha from engine stopped to full rpm. */
  propBlurMin: 0.03,
  propBlurMax: 0.2,
};

/** Sound levels: one master gain for the whole synthesized mix. */
export const AUDIO = { masterGain: 0.5 };
