// The archipelago: islands, terrain height, the runway, the ring courses, the clouds and
// the sortie's wind, all grown from one seed so every visit (and every screenshot) sees
// the same place. No drawing and no browser in here: the flight model asks this module
// how high the ground is, and the renderer asks it what there is to draw.
import { RING, WORLD_SEED } from './config.js';
import { createRandom, range } from './random.js';

export const ISLAND_GREEN = 'green';
export const ISLAND_VOLCANO = 'volcano';

/** The runway's height above the sea, and how wide a bench is flattened for it. */
export const RUNWAY_ELEVATION = 6;
const RUNWAY_BLEND = 210;

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** One island's height at a distance from its centre, before the runway bench is cut. */
function islandProfile(island, distance) {
  if (distance >= island.radius) return 0;
  const t = 1 - distance / island.radius;
  if (island.kind === ISLAND_VOLCANO) {
    // A cone, steep near the top, with the crater bitten out of the summit.
    let h = island.peak * Math.pow(t, 0.78);
    if (t > 0.84) h -= ((t - 0.84) / 0.16) * island.peak * 0.24;
    return h;
  }
  return island.peak * smoothstep(t);
}

export function createWorld(seed = WORLD_SEED) {
  const random = createRandom(seed);

  // Hand-placed anchors (the recognisable map) with a seeded wobble, so the layout is
  // composed rather than scattered, yet no two builds of the seed drift apart.
  const anchors = [
    { name: 'Pulau Besar', x: 0, y: 0, radius: 950, peak: 130, kind: ISLAND_GREEN },
    { name: 'Gunung Api', x: 2500, y: 1900, radius: 720, peak: 430, kind: ISLAND_VOLCANO },
    { name: 'Pulau Karang', x: 900, y: 1500, radius: 380, peak: 60, kind: ISLAND_GREEN },
    { name: 'Pulau Pasir', x: -1500, y: 900, radius: 300, peak: 36, kind: ISLAND_GREEN },
    { name: 'Pulau Rimba', x: -2100, y: -1300, radius: 460, peak: 88, kind: ISLAND_GREEN },
    { name: 'Pulau Kecil', x: 1700, y: -1500, radius: 260, peak: 30, kind: ISLAND_GREEN },
    { name: 'Batu Tengah', x: -600, y: 2300, radius: 210, peak: 22, kind: ISLAND_GREEN },
  ];
  const islands = anchors.map((anchor) => {
    const island = {
      ...anchor,
      x: anchor.x + range(random, -90, 90),
      y: anchor.y + range(random, -90, 90),
      radius: anchor.radius * range(random, 0.94, 1.06),
      trees: [],
    };
    const treeCount = Math.round(island.radius / 16);
    for (let index = 0; index < treeCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const dist = island.radius * (0.18 + random() * 0.6);
      const x = island.x + Math.cos(angle) * dist;
      const y = island.y + Math.sin(angle) * dist;
      const h = islandProfile(island, dist);
      if (h > 5 && h < island.peak * 0.82) island.trees.push({ x, y, z: h, s: range(random, 0.7, 1.5) });
    }
    // Satellite-style tone patches: olive, dark and pale blobs scattered over the island.
    island.patches = [];
    const patchCount = Math.round(island.radius / 55);
    for (let index = 0; index < patchCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const dist = island.radius * (0.15 + random() * 0.68);
      island.patches.push({
        x: island.x + Math.cos(angle) * dist,
        y: island.y + Math.sin(angle) * dist,
        r: range(random, 30, island.radius * 0.2),
        tone: Math.floor(range(random, 0, 3)),
      });
    }
    return island;
  });
  const mainIsland = islands[0];
  const volcano = islands[1];

  // The runway: a bench on Pulau Besar's south coast, running east-west.
  const runway = {
    x: mainIsland.x + 150,
    y: mainIsland.y - 700,
    heading: Math.PI / 2,
    length: 720,
    width: 46,
    elevation: RUNWAY_ELEVATION,
  };
  runway.dirX = Math.sin(runway.heading);
  runway.dirY = Math.cos(runway.heading);
  runway.perpX = runway.dirY;
  runway.perpY = -runway.dirX;

  /** A point from the runway's frame (along, across) back into world coordinates. */
  function runwayPoint(along, across) {
    return {
      x: runway.x + runway.dirX * along + runway.perpX * across,
      y: runway.y + runway.dirY * along + runway.perpY * across,
    };
  }

  // The airport furniture: a taxiway parallel to the strip, a small terminal block and
  // two parked planes beside it, all placed in the runway's frame.
  const airport = {
    taxiwayAcross: 82,
    terminal: { ...runwayPoint(-150, 128), width: 90, depth: 34, height: 11 },
    parked: [
      { ...runwayPoint(-215, 104), heading: 0.5 },
      { ...runwayPoint(-95, 106), heading: -0.4 },
    ],
  };

  // Roads and a river on Pulau Besar, drawn as light lines over the green: a coast road,
  // a road inland from the field, and the river running north to its mouth.
  const roads = [
    [[-700, -480], [-350, -600], [0, -640], [350, -580], [700, -430]].map(([dx, dy]) => ({ x: mainIsland.x + dx, y: mainIsland.y + dy })),
    [[150, -620], [120, -300], [60, 0], [10, 300], [-40, 560]].map(([dx, dy]) => ({ x: mainIsland.x + dx, y: mainIsland.y + dy })),
  ];
  const river = [[80, 240], [30, 420], [-20, 580], [-60, 740], [-85, 900]]
    .map(([dx, dy]) => ({ x: mainIsland.x + dx, y: mainIsland.y + dy }));

  /** A point in the runway's own frame: along the centreline and across it, in metres. */
  function runwayFrame(x, y) {
    const dx = x - runway.x;
    const dy = y - runway.y;
    return { along: dx * runway.dirX + dy * runway.dirY, across: dx * runway.perpX + dy * runway.perpY };
  }

  function groundHeight(x, y) {
    let h = 0;
    for (const island of islands) {
      const d = Math.hypot(x - island.x, y - island.y);
      const height = islandProfile(island, d);
      if (height > h) h = height;
    }
    const frame = runwayFrame(x, y);
    const outAlong = Math.max(0, Math.abs(frame.along) - runway.length / 2);
    const outAcross = Math.max(0, Math.abs(frame.across) - runway.width / 2);
    const outside = Math.hypot(outAlong, outAcross);
    if (outside < RUNWAY_BLEND) {
      const f = smoothstep(1 - outside / RUNWAY_BLEND);
      h = h * (1 - f) + RUNWAY_ELEVATION * f;
    }
    return h;
  }

  // Ring courses, laid over the map by hand: each ring hangs over water or a shoulder,
  // high enough to clear the ground under it, with its facing worked out from its
  // neighbours so the ring always fronts the pilot flying the course.
  function makeCourse(id, name, par, specs) {
    const rings = specs.map((spec) => {
      const x = spec[0] + range(random, -50, 50);
      const y = spec[1] + range(random, -50, 50);
      const z = Math.max(spec[2] + range(random, -12, 12), groundHeight(x, y) + 48);
      return { x, y, z, radius: RING.radius, nx: 0, ny: 1 };
    });
    for (let index = 0; index < rings.length; index += 1) {
      const prev = rings[Math.max(0, index - 1)];
      const next = rings[Math.min(rings.length - 1, index + 1)];
      let nx = next.x - prev.x;
      let ny = next.y - prev.y;
      const len = Math.hypot(nx, ny) || 1;
      rings[index].nx = nx / len;
      rings[index].ny = ny / len;
    }
    return { id, name, par, rings };
  }

  const courses = [
    makeCourse('harbour', 'Harbour Loop', 150, [
      [0, -1250, 150], [1000, -650, 185], [1150, 350, 160],
      [350, 1150, 200], [-800, 900, 165], [-1150, -300, 190],
    ]),
    makeCourse('volcano', 'Volcano Run', 260, [
      [1200, 900, 210], [1900, 1400, 265], [2500, 1080, 300],
      [3320, 1900, 360], [2500, 2720, 430], [1750, 2300, 300],
      [900, 1600, 225], [300, 800, 180],
    ]),
    makeCourse('tour', 'Grand Tour', 380, [
      [0, -1450, 170], [-1500, 300, 150], [-2150, -550, 200],
      [-800, -1750, 160], [900, -1550, 180], [1750, -800, 205],
      [1950, 600, 240], [1200, 1550, 220], [250, 1950, 200], [0, 950, 180],
    ]),
  ];

  // Clouds: seeded puffs that drift with the wind, high enough to fly under or through.
  const clouds = [];
  for (let index = 0; index < 26; index += 1) {
    clouds.push({
      x: range(random, -4200, 4200),
      y: range(random, -4200, 4200),
      z: range(random, 170, 430),
      r: range(random, 90, 250),
    });
  }

  // The sortie's steady wind: a seeded direction and strength.
  const windAngle = random() * Math.PI * 2;
  const wind = { dirX: Math.sin(windAngle), dirY: Math.cos(windAngle), speed: range(random, 2, 6), angle: windAngle };

  return { islands, mainIsland, volcano, runway, runwayFrame, runwayPoint, airport, roads, river, groundHeight, courses, clouds, wind };
}
