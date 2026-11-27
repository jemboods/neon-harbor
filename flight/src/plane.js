// The aeroplane itself: a true-scale Cessna 172S built from flat-shaded polygons.
// The geometry is a static table of vertices and faces in plane-local metres, built
// once at module load; drawing transforms the table by the plane's heading, pitch
// and roll, projects every vertex through the renderer's camera, shades each face
// from its world normal against the sun, and fills the faces back to front.
//
// Plane-local axes: u forward (nose +4.14, tail -4.14), v to starboard, w up.
// w is measured from the ground under the wheels, so a placement's z is the height
// of the ground contact plane: the fuselage centre rides about 1.4 m above it.
import { PALETTE } from './config.js';

// --- Dimensions, metres, from the real 172S ---------------------------------

const LENGTH_HALF = 4.14; // half the 8.28 m length: nose and tail from the centre
const WING_SPAN = 11.0;
const WING_HALF_SPAN = WING_SPAN / 2;
const WING_CHORD_ROOT = 1.63;
const WING_CHORD_TIP = 1.15;
const WING_LE_ROOT_U = 1.35; // leading edge u at the root; the tips sweep back a touch
const WING_LE_TIP_U = 1.05;
const WING_BASE_W = 1.94; // wing underside height at the root, over the cabin roof
const WING_THICK_ROOT = 0.16;
const WING_THICK_TIP = 0.10;
const DIHEDRAL_RISE = 0.055; // metres of tip rise per metre of span
const HINGE_FRACTION = 0.72; // the flap / aileron lives behind this chord fraction
const STRUT_SPAN = 2.2; // strut meets the wing at 40% span, the 172's signature
const TAIL_SPAN = 3.4;
const TAIL_CHORD = 0.95;
const TAIL_LE_U = -3.3;
const TAIL_BASE_W = 1.68;
const TAIL_THICK = 0.09;
const FIN_HALF_THICK = 0.05;
const PROP_RADIUS = 0.96; // a 76-inch propeller, halved
const PROP_U = 4.14; // the propeller disc plane, at the nose mark
const PROP_CENTRE_W = 1.32;
const NOSE_WHEEL_U = 2.35;
const MAIN_WHEEL_U = 0.45; // 1.9 m of wheelbase behind the nose wheel
const MAIN_TRACK_HALF = 1.2; // half the 2.4 m main gear track
const NOSE_WHEEL_RADIUS = 0.26;
const MAIN_WHEEL_RADIUS = 0.33;

// Livery: warm off-white body, the reds of the current paint, amber pinstripe.
const BODY = PALETTE.planeBody;
const RED = '#c33d2e';
const RED_DARK = '#8f2d23';
const TRIM = PALETTE.planeTrim;
const STRIPE = PALETTE.amber;
const GLASS = PALETTE.canopy;
const TYRE = '#20242a';
const HUB = '#5b626b';
const METAL = '#8b9096';
const NAV_PORT = '#ff3b30';
const NAV_STARBOARD = '#2eff7a';

// Shading: an ambient floor plus a diffuse term from the face normal and the sun,
// all scaled by the day phase's brightness so dawn and dusk fly darker and warmer.
const SHADE_AMBIENT = 0.38;
const SHADE_DIFFUSE = 0.62;
const DAY_FLOOR = 0.55;
const DAY_RANGE = 0.45;
const WARM_MIX = 0.22; // how far colours lean toward WARM at full dusk glow
const WARM = [255, 166, 96];
const DISC_ALPHA = 0.15;
const DISC_SEGMENTS = 18;
const RING_POINTS = 8; // the fuselage loft is octagonal

// --- Small vector and colour helpers -----------------------------------------

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function shadeString(rgb, brightness, warm) {
  const mix = (channel, warmChannel) => clamp(Math.round((channel + (warmChannel - channel) * warm) * brightness), 0, 255);
  return `rgb(${mix(rgb[0], WARM[0])},${mix(rgb[1], WARM[1])},${mix(rgb[2], WARM[2])})`;
}

// --- The static model ---------------------------------------------------------
// Builders append vertices and faces to these tables. A face is a list of vertex
// indices plus a base colour; `flat` faces (the nav lights) skip shading.

const vertices = [];
const faces = [];
const parkedFaces = []; // extra faces only a parked plane wears: the resting blades

function vertex(u, v, w) {
  vertices.push([u, v, w]);
  return vertices.length - 1;
}

function face(list, points, color, flat = false) {
  list.push({ pts: points.map(([u, v, w]) => vertex(u, v, w)), rgb: hexRgb(color), flat });
}

function quad(list, a, b, c, d, color, flat = false) {
  face(list, [a, b, c, d], color, flat);
}

/** An axis-aligned box in local coordinates, all six faces. */
function box(list, u0, u1, v0, v1, w0, w1, color) {
  quad(list, [u0, v0, w1], [u1, v0, w1], [u1, v1, w1], [u0, v1, w1], color); // top
  quad(list, [u0, v0, w0], [u0, v1, w0], [u1, v1, w0], [u1, v0, w0], color); // bottom
  quad(list, [u1, v0, w0], [u1, v1, w0], [u1, v1, w1], [u1, v0, w1], color); // front
  quad(list, [u0, v0, w0], [u0, v0, w1], [u0, v1, w1], [u0, v1, w0], color); // back
  quad(list, [u0, v1, w0], [u0, v1, w1], [u1, v1, w1], [u1, v1, w0], color); // starboard
  quad(list, [u0, v0, w0], [u1, v0, w0], [u1, v0, w1], [u0, v0, w1], color); // port
}

/** A slim prism from point a to point b; hu and hp are the half-thicknesses along
 *  local u and along the direction perpendicular to the run, in its own plane. */
function beam(list, a, b, hu, hp, color) {
  const dv = b[1] - a[1];
  const dw = b[2] - a[2];
  const len = Math.hypot(dv, dw) || 1;
  // The perpendicular to the run within the v-w plane (the run barely moves in u).
  const pv = -dw / len;
  const pw = dv / len;
  const corner = (p, su, sp) => [p[0] + su * hu, p[1] + sp * hp * pv, p[2] + sp * hp * pw];
  const a1 = corner(a, -1, -1);
  const a2 = corner(a, 1, -1);
  const a3 = corner(a, 1, 1);
  const a4 = corner(a, -1, 1);
  const b1 = corner(b, -1, -1);
  const b2 = corner(b, 1, -1);
  const b3 = corner(b, 1, 1);
  const b4 = corner(b, -1, 1);
  quad(list, a1, a2, b2, b1, color);
  quad(list, a2, a3, b3, b2, color);
  quad(list, a3, a4, b4, b3, color);
  quad(list, a4, a1, b1, b4, color);
}

/** A flat prism: a (u, w) profile extruded across v by half-thick on each side. */
function profilePrism(list, profile, halfThick, color) {
  const n = profile.length;
  const side = (sign) => profile.map(([u, w]) => [u, sign * halfThick, w]);
  face(list, side(1), color);
  face(list, side(-1).reverse(), color);
  for (let i = 0; i < n; i += 1) {
    const [u0, w0] = profile[i];
    const [u1, w1] = profile[(i + 1) % n];
    quad(list, [u0, -halfThick, w0], [u1, -halfThick, w1], [u1, halfThick, w1], [u0, halfThick, w0], color);
  }
}

/** A wheel: a hexagonal prism across v, dark rubber with a lighter hub outside. */
function wheel(list, centreU, centreV, centreW, radius, width) {
  const sides = 6;
  const ring = (v) => {
    const pts = [];
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2 + Math.PI / 6;
      pts.push([centreU + Math.cos(a) * radius, v, centreW + Math.sin(a) * radius]);
    }
    return pts;
  };
  const inner = ring(centreV - width / 2);
  const outer = ring(centreV + width / 2);
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    quad(list, inner[i], inner[j], outer[j], outer[i], TYRE);
  }
  face(list, outer, HUB);
  face(list, inner.reverse(), TYRE);
}

// --- The fuselage loft ---------------------------------------------------------
// Cross-sections from spinner to tail cone: centre height, half width, half height.
// The cabin stands tall amidships; the tail cone tapers and rises a little.

const STATIONS = [
  { u: 4.0, wc: 1.32, halfW: 0.30, halfH: 0.30 },
  { u: 3.55, wc: 1.30, halfW: 0.50, halfH: 0.46 },
  { u: 2.75, wc: 1.32, halfW: 0.53, halfH: 0.52 },
  { u: 1.85, wc: 1.38, halfW: 0.54, halfH: 0.58 },
  { u: 0.95, wc: 1.40, halfW: 0.54, halfH: 0.60 },
  { u: 0.05, wc: 1.42, halfW: 0.52, halfH: 0.58 },
  { u: -0.95, wc: 1.46, halfW: 0.46, halfH: 0.50 },
  { u: -1.95, wc: 1.52, halfW: 0.36, halfH: 0.40 },
  { u: -2.85, wc: 1.58, halfW: 0.26, halfH: 0.30 },
  { u: -3.6, wc: 1.64, halfW: 0.18, halfH: 0.22 },
  { u: -LENGTH_HALF, wc: 1.70, halfW: 0.09, halfH: 0.13 },
];

/** The octagon points of one station, from starboard-mid around the top. */
function stationRing(station) {
  const pts = [];
  for (let i = 0; i < RING_POINTS; i += 1) {
    const a = (i / RING_POINTS) * Math.PI * 2;
    pts.push([station.u, Math.cos(a) * station.halfW, station.wc + Math.sin(a) * station.halfH]);
  }
  return pts;
}

/** The half width of a station's ellipse at a height offset from its centre. */
function halfWidthAt(station, w) {
  const f = clamp(1 - ((w - station.wc) / station.halfH) ** 2, 0.04, 1);
  return station.halfW * Math.sqrt(f);
}

/** The colour of one loft quad: the cabin's glass is let into the loft itself, so
 *  it always sits flush. The windshield is the cabin front slope's upper facets;
 *  the side windows are the flank facets of the two cabin segments. Facets run
 *  from starboard-mid (0) over the top (2) to port-mid (4). */
function fuselageColor(segment, facet) {
  if (segment === 2 && (facet === 1 || facet === 2)) return GLASS;
  if ((segment === 3 || segment === 4) && (facet === 0 || facet === 4)) return GLASS;
  return BODY;
}

function buildFuselage() {
  const rings = STATIONS.map(stationRing);
  for (let s = 0; s < rings.length - 1; s += 1) {
    for (let i = 0; i < RING_POINTS; i += 1) {
      const j = (i + 1) % RING_POINTS;
      quad(faces, rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i], fuselageColor(s, i));
    }
  }
  face(faces, rings[0], BODY); // the cowl face behind the spinner
  face(faces, rings[rings.length - 1].slice().reverse(), BODY); // the tail cap
}

/** The cheatline: a red band and an amber pinstripe hugging both flanks. */
function buildCheatline() {
  const bands = [
    { top: 0.06, bottom: -0.14, color: TRIM },
    { top: -0.17, bottom: -0.23, color: STRIPE },
  ];
  for (const band of bands) {
    for (let s = 2; s < STATIONS.length - 1; s += 1) {
      const a = STATIONS[s];
      const b = STATIONS[s + 1];
      for (const side of [1, -1]) {
        const out = 0.008;
        quad(faces,
          [a.u, side * (halfWidthAt(a, a.wc + band.top) + out), a.wc + band.top],
          [b.u, side * (halfWidthAt(b, b.wc + band.top) + out), b.wc + band.top],
          [b.u, side * (halfWidthAt(b, b.wc + band.bottom) + out), b.wc + band.bottom],
          [a.u, side * (halfWidthAt(a, a.wc + band.bottom) + out), a.wc + band.bottom],
          band.color);
      }
    }
  }
}

/** The rear window, a single panel on the cabin's aft slope; the windshield and
 *  side windows live in the loft itself (see fuselageColor). */
function buildGlass() {
  quad(faces, [0.15, -0.28, 2.0], [0.15, 0.28, 2.0], [-0.5, 0.24, 1.93], [-0.5, -0.24, 1.93], GLASS);
}

// --- The wing ------------------------------------------------------------------
// Span stations carry the planform: leading edge, chord and underside height. Each
// bay is two boxes: the main box ahead of the hinge line, the flap or aileron
// behind it, a step thinner so the hinge reads as a shadow line.

function wingStation(v) {
  const t = Math.abs(v) / WING_HALF_SPAN;
  const le = WING_LE_ROOT_U + (WING_LE_TIP_U - WING_LE_ROOT_U) * t;
  const chord = WING_CHORD_ROOT + (WING_CHORD_TIP - WING_CHORD_ROOT) * t;
  return {
    v,
    le,
    te: le - chord,
    hinge: le - chord * HINGE_FRACTION,
    wBot: WING_BASE_W + DIHEDRAL_RISE * Math.abs(v),
    thick: WING_THICK_ROOT + (WING_THICK_TIP - WING_THICK_ROOT) * t,
  };
}

/** One chordwise box of the wing between two span stations: top, bottom, the two
 *  chordwise end faces, and a cap only where `capEnd` says the span ends. */
function wingBay(a, b, uFront, uBack, thickScale, capEnd) {
  const top = (s) => s.wBot + s.thick * thickScale;
  const inset = (s) => s.wBot + s.thick * (1 - thickScale) / 2;
  quad(faces, [uFront(a), a.v, top(a)], [uFront(b), b.v, top(b)], [uBack(b), b.v, top(b)], [uBack(a), a.v, top(a)], BODY);
  quad(faces, [uFront(a), a.v, inset(a)], [uBack(a), a.v, inset(a)], [uBack(b), b.v, inset(b)], [uFront(b), b.v, inset(b)], BODY);
  quad(faces, [uFront(a), a.v, inset(a)], [uFront(b), b.v, inset(b)], [uFront(b), b.v, top(b)], [uFront(a), a.v, top(a)], BODY);
  quad(faces, [uBack(a), a.v, inset(a)], [uBack(a), a.v, top(a)], [uBack(b), b.v, top(b)], [uBack(b), b.v, inset(b)], BODY);
  if (capEnd !== 0) {
    const s = capEnd > 0 ? b : a;
    quad(faces, [uFront(s), s.v, inset(s)], [uBack(s), s.v, inset(s)], [uBack(s), s.v, top(s)], [uFront(s), s.v, top(s)], BODY);
  }
}

function buildWing() {
  const spans = [-WING_HALF_SPAN, -4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2, WING_HALF_SPAN];
  const stations = spans.map(wingStation);
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    const cap = i === 0 ? -1 : i === stations.length - 2 ? 1 : 0;
    wingBay(a, b, (s) => s.le, (s) => s.hinge, 1, cap);
    wingBay(a, b, (s) => s.hinge - 0.015, (s) => s.te, 0.7, cap);
  }
  // Nav lights: a small bright face let into each tip's trailing corner.
  for (const side of [1, -1]) {
    const tip = wingStation(side * WING_HALF_SPAN);
    const w = tip.wBot + tip.thick * 0.5;
    quad(faces, [tip.te + 0.22, side * (WING_HALF_SPAN + 0.004), w - 0.05],
      [tip.te + 0.02, side * (WING_HALF_SPAN + 0.004), w - 0.05],
      [tip.te + 0.02, side * (WING_HALF_SPAN + 0.004), w + 0.05],
      [tip.te + 0.22, side * (WING_HALF_SPAN + 0.004), w + 0.05],
      side < 0 ? NAV_PORT : NAV_STARBOARD, true);
  }
  // The lift struts: lower fuselage up to the wing underside at 40% span.
  for (const side of [1, -1]) {
    const at = wingStation(side * STRUT_SPAN);
    beam(faces, [0.72, side * 0.40, 0.98], [0.60, side * STRUT_SPAN, at.wBot - 0.02], 0.055, 0.028, BODY);
  }
}

// --- The tail ------------------------------------------------------------------

function buildTail() {
  // Horizontal stabilizer and elevators, two boxes deep like the wing.
  const spans = [-TAIL_SPAN / 2, 0, TAIL_SPAN / 2];
  for (let i = 0; i < spans.length - 1; i += 1) {
    const v0 = spans[i];
    const v1 = spans[i + 1];
    const hinge = TAIL_LE_U - TAIL_CHORD * HINGE_FRACTION;
    box(faces, hinge, TAIL_LE_U, v0, v1, TAIL_BASE_W, TAIL_BASE_W + TAIL_THICK, BODY);
    box(faces, TAIL_LE_U - TAIL_CHORD, hinge - 0.012, v0, v1, TAIL_BASE_W + 0.015, TAIL_BASE_W + TAIL_THICK - 0.015, BODY);
  }
  // The fin: a swept leading edge with the dorsal fillet running forward, in red,
  // and the rudder behind its hinge line in the darker red.
  profilePrism(faces, [
    [-1.45, 1.88], [-2.55, 2.08], [-3.30, 2.44], [-3.58, 2.70],
    [-3.94, 2.70], [-3.96, 1.84], [-3.55, 1.78], [-2.2, 1.80],
  ], FIN_HALF_THICK, RED);
  profilePrism(faces, [
    [-3.94, 2.70], [-4.06, 2.69], [-4.20, 1.88], [-3.97, 1.85],
  ], FIN_HALF_THICK + 0.002, RED_DARK);
}

// --- Gear, propeller, details ----------------------------------------------------

function buildGear() {
  // Nose leg and wheel, under the cowl.
  beam(faces, [2.42, 0, 0.98], [NOSE_WHEEL_U, 0, NOSE_WHEEL_RADIUS + 0.05], 0.05, 0.05, METAL);
  wheel(faces, NOSE_WHEEL_U, 0, NOSE_WHEEL_RADIUS, NOSE_WHEEL_RADIUS, 0.13);
  for (const side of [1, -1]) {
    // Spring main legs, splayed out to the track, with a fairing over each wheel.
    beam(faces, [0.62, side * 0.40, 0.94], [MAIN_WHEEL_U, side * MAIN_TRACK_HALF, MAIN_WHEEL_RADIUS + 0.06], 0.06, 0.045, METAL);
    wheel(faces, MAIN_WHEEL_U, side * MAIN_TRACK_HALF, MAIN_WHEEL_RADIUS, MAIN_WHEEL_RADIUS, 0.17);
    box(faces, MAIN_WHEEL_U - MAIN_WHEEL_RADIUS - 0.14, MAIN_WHEEL_U + MAIN_WHEEL_RADIUS + 0.14,
      side * MAIN_TRACK_HALF - 0.13, side * MAIN_TRACK_HALF + 0.13, MAIN_WHEEL_RADIUS + 0.10, MAIN_WHEEL_RADIUS + 0.47, BODY);
  }
}

function buildProp() {
  // The spinner: an eight-sided cone from the cowl face to its tip. It sits in the
  // shared face list; the parked list below only adds the resting blades.
  const base = [];
  for (let i = 0; i < RING_POINTS; i += 1) {
    const a = (i / RING_POINTS) * Math.PI * 2;
    base.push([3.98, Math.cos(a) * 0.19, PROP_CENTRE_W + Math.sin(a) * 0.19]);
  }
  const tip = [4.30, 0, PROP_CENTRE_W];
  for (let i = 0; i < RING_POINTS; i += 1) {
    face(faces, [base[i], base[(i + 1) % RING_POINTS], tip], RED);
  }
  // Parked blades: two blades at a resting angle, where the spinning disc would be.
  const tilt = 0.42;
  const dirV = Math.sin(tilt);
  const dirW = Math.cos(tilt);
  for (const sign of [1, -1]) {
    const end = [PROP_U, sign * dirV * (PROP_RADIUS - 0.06), PROP_CENTRE_W + sign * dirW * (PROP_RADIUS - 0.06)];
    beam(parkedFaces, [PROP_U, 0, PROP_CENTRE_W], end, 0.02, 0.075, '#2a2d33');
  }
  // A cabin-top antenna, a small blade of dark plastic.
  box(faces, 0.12, 0.34, -0.014, 0.014, 1.98, 2.22, '#26282e');
}

buildFuselage();
buildCheatline();
buildGlass();
buildWing();
buildTail();
buildGear();
buildProp();

// The parked model is the flying model plus the resting blades.
const MODEL_FACES = faces;
const MODEL_PARKED_FACES = faces.concat(parkedFaces);

export const PLANE_FACE_COUNT = MODEL_FACES.length;
export const PLANE_PARKED_FACE_COUNT = MODEL_PARKED_FACES.length;

// --- Drawing ---------------------------------------------------------------------

/** The plane's world basis: forward, right and up unit vectors from its attitude.
 *  Pitch raises the nose along the heading; roll banks right and up around the
 *  forward axis, the same sense the flight model turns with. */
function planeBasis(heading, pitch, roll) {
  const sh = Math.sin(heading);
  const ch = Math.cos(heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const f = [sh * cp, ch * cp, sp];
  const r0 = [ch, -sh, 0];
  const u0 = [-sh * sp, -ch * sp, cp];
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const r = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr];
  const u = [r0[0] * sr + u0[0] * cr, r0[1] * sr + u0[1] * cr, r0[2] * sr + u0[2] * cr];
  return { f, r, u };
}

/**
 * Draw the plane at a placement: { x, y, z, heading, pitch, roll } for the ground
 * contact point, `sun` the world direction to the sun, `sunLevel` and `glow` from
 * the day palette, and `prop` either 'spin' (a blurred disc) or 'parked' (blades).
 */
export function drawPlaneModel(context, cam, place) {
  const { f, r, u } = planeBasis(place.heading, place.pitch, place.roll);
  const sunLen = Math.hypot(place.sun.x, place.sun.y, place.sun.z) || 1;
  const sun = [place.sun.x / sunLen, place.sun.y / sunLen, place.sun.z / sunLen];
  const dayFactor = DAY_FLOOR + DAY_RANGE * clamp(place.sunLevel, 0, 1);
  const warm = WARM_MIX * clamp(place.glow, 0, 1);

  // Transform every vertex to the world, then project it once.
  const world = vertices.map(([lu, lv, lw]) => [
    place.x + f[0] * lu + r[0] * lv + u[0] * lw,
    place.y + f[1] * lu + r[1] * lv + u[1] * lw,
    place.z + f[2] * lu + r[2] * lv + u[2] * lw,
  ]);
  const projected = world.map(([x, y, z]) => cam.project(x, y, z));

  const model = place.prop === 'parked' ? MODEL_PARKED_FACES : MODEL_FACES;
  const lit = [];
  for (const item of model) {
    let depth = 0;
    let visible = true;
    for (const index of item.pts) {
      const p = projected[index];
      if (!p) { visible = false; break; }
      depth += p.d;
    }
    if (!visible) continue;
    // The face normal from its first three world vertices, flipped to point away
    // from the model's heart so shading never depends on winding.
    const [ax, ay, az] = world[item.pts[0]];
    const [bx, by, bz] = world[item.pts[1]];
    const [cx, cy, cz] = world[item.pts[2]];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (const index of item.pts) {
      gx += world[index][0];
      gy += world[index][1];
      gz += world[index][2];
    }
    const outX = gx / item.pts.length - place.x;
    const outY = gy / item.pts.length - place.y;
    const outZ = gz / item.pts.length - (place.z + PROP_CENTRE_W);
    if (nx * outX + ny * outY + nz * outZ < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const diffuse = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]);
    const brightness = item.flat ? 1 : (SHADE_AMBIENT + SHADE_DIFFUSE * diffuse) * dayFactor;
    lit.push({ item, depth: depth / item.pts.length, brightness });
  }
  lit.sort((a, b) => b.depth - a.depth);
  for (const { item, brightness } of lit) {
    context.fillStyle = shadeString(item.rgb, brightness, item.flat ? 0 : warm);
    context.beginPath();
    const first = projected[item.pts[0]];
    context.moveTo(first.x, first.y);
    for (let i = 1; i < item.pts.length; i += 1) {
      const p = projected[item.pts[i]];
      context.lineTo(p.x, p.y);
    }
    context.closePath();
    context.fill();
  }

  if (place.prop === 'spin') {
    // The propeller as a translucent disc at the nose, over the spinner. The
    // disc is only as present as the prop is working: place.propBlend (0 with
    // the engine stopped, 1 at full rpm) fades it toward a ghost.
    const blend = clamp(place.propBlend ?? 1, 0, 1);
    const discAlpha = DISC_ALPHA * (0.15 + 0.85 * blend);
    const rim = [];
    let visible = true;
    for (let i = 0; i < DISC_SEGMENTS; i += 1) {
      const a = (i / DISC_SEGMENTS) * Math.PI * 2;
      const lv = Math.cos(a) * PROP_RADIUS;
      const lw = PROP_CENTRE_W + Math.sin(a) * PROP_RADIUS;
      const p = cam.project(
        place.x + f[0] * PROP_U + r[0] * lv + u[0] * lw,
        place.y + f[1] * PROP_U + r[1] * lv + u[1] * lw,
        place.z + f[2] * PROP_U + r[2] * lv + u[2] * lw,
      );
      if (!p) { visible = false; break; }
      rim.push(p);
    }
    if (visible) {
      context.fillStyle = `rgba(226, 233, 238, ${discAlpha})`;
      context.beginPath();
      context.moveTo(rim[0].x, rim[0].y);
      for (let i = 1; i < rim.length; i += 1) context.lineTo(rim[i].x, rim[i].y);
      context.closePath();
      context.fill();
    }
  }
}
