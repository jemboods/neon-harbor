// Drawing only: the world through a chase or cockpit camera, the instruments, the HUD
// and the screens. The flight state and the screen in, pixels out. The scene is a
// perspective projection of the archipelago: sea and sky first, then the islands as
// stacked contour rings far to near, the airport on Pulau Besar, the rings, the clouds,
// and (in chase view) the plane. The cockpit view bolts a Cessna-style panel over the
// lower frame: the standard six-pack, a tachometer, fuel, flaps and a radio stack.
import { ASI, DAY_KEYS, FIELD, FONT, PALETTE, PLANE, RPM, UNITS, WORLD_EXTENT } from './config.js';
import { END_COMPLETE, END_CRASHED, END_DITCHED, END_LANDED, MODE_COURSE, MODE_LANDING } from './flight.js';
import { ISLAND_VOLCANO } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export const VIEW_COCKPIT = 'cockpit';
export const VIEW_CHASE = 'chase';

/** Where the cockpit panel starts: it fills the lower two fifths of the frame. */
const PANEL_TOP = 428;

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function lerp(a, b, f) {
  return a + (b - a) * f;
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixHex(a, b, f) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], f))},${Math.round(lerp(ca[1], cb[1], f))},${Math.round(lerp(ca[2], cb[2], f))})`;
}

/** The sky and sea colours at a point of the day cycle, blended between keyframes. */
export function dayPalette(phase) {
  const keys = DAY_KEYS;
  let index = 0;
  while (index < keys.length - 2 && phase > keys[index + 1].phase) index += 1;
  const a = keys[index];
  const b = keys[index + 1];
  const f = clamp((phase - a.phase) / Math.max(0.0001, b.phase - a.phase), 0, 1);
  return {
    skyTop: mixHex(a.skyTop, b.skyTop, f),
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon, f),
    seaDeep: mixHex(a.seaDeep, b.seaDeep, f),
    seaFar: mixHex(a.seaFar, b.seaFar, f),
    sun: lerp(a.sun, b.sun, f),
    glow: lerp(a.glow, b.glow, f),
  };
}

/** The sun's direction at a phase: east at dawn, high at noon, west at dusk. */
function sunDirection(phase) {
  const sweep = clamp(phase / 0.8, 0, 1) * Math.PI;
  return { x: Math.cos(sweep), y: -Math.sin(sweep) * 0.55, z: Math.sin(sweep) * 0.8 + 0.03 };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function fontFor(size, weight) {
    const key = `${weight || ''} ${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    context.font = fontFor(size, weight);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha = 0.78) {
    context.fillStyle = `rgba(11, 28, 38, ${alpha})`;
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.fill();
    context.strokeStyle = PALETTE.panelLine;
    context.lineWidth = 1;
    context.stroke();
  }

  // --- The camera -----------------------------------------------------------

  function makeCamera(state, viewKind) {
    const fx = Math.sin(state.heading);
    const fy = Math.cos(state.heading);
    let cx;
    let cy;
    let cz;
    let lx;
    let ly;
    let lz;
    if (viewKind === VIEW_COCKPIT) {
      cx = state.x + fx * 2;
      cy = state.y + fy * 2;
      cz = state.z + 1.5;
      lx = state.x + fx * 220;
      ly = state.y + fy * 220;
      lz = state.z + Math.tan(state.pitch) * 220 + 1.5;
    } else {
      cx = state.x - fx * PLANE.camBack;
      cy = state.y - fy * PLANE.camBack;
      cz = state.z + PLANE.camUp;
      lx = state.x + fx * PLANE.camLookAhead;
      ly = state.y + fy * PLANE.camLookAhead;
      lz = state.z + Math.sin(state.pitch) * 60 - 4;
    }
    let fwdX = lx - cx;
    let fwdY = ly - cy;
    let fwdZ = lz - cz;
    const fl = Math.hypot(fwdX, fwdY, fwdZ) || 1;
    fwdX /= fl;
    fwdY /= fl;
    fwdZ /= fl;
    // right = fwd x world-up, up = right x fwd.
    let rightX = fwdY;
    let rightY = -fwdX;
    let rightZ = 0;
    const rl = Math.hypot(rightX, rightY, rightZ) || 1;
    rightX /= rl;
    rightY /= rl;
    rightZ /= rl;
    const upX = rightY * fwdZ - rightZ * fwdY;
    const upY = rightZ * fwdX - rightX * fwdZ;
    const upZ = rightX * fwdY - rightY * fwdX;
    const focal = (FIELD.height / 2) / Math.tan((PLANE.fovDeg * Math.PI) / 360);
    const rollAngle = -state.roll * (viewKind === VIEW_COCKPIT ? 1 : 0.55);
    const cosR = Math.cos(rollAngle);
    const sinR = Math.sin(rollAngle);
    const centreX = FIELD.width / 2;
    const centreY = FIELD.height / 2;

    function project(x, y, z) {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const zc = dx * fwdX + dy * fwdY + dz * fwdZ;
      if (!(zc >= 3)) return null;
      const xc = dx * rightX + dy * rightY + dz * rightZ;
      const yc = dx * upX + dy * upY + dz * upZ;
      const sx = centreX + (xc / zc) * focal;
      const sy = centreY - (yc / zc) * focal;
      const ox = sx - centreX;
      const oy = sy - centreY;
      return {
        x: centreX + ox * cosR - oy * sinR,
        y: centreY + ox * sinR + oy * cosR,
        d: zc,
        scale: focal / zc,
      };
    }

    return { project, cx, cy, cz, fwdX, fwdY, fwdZ, rightX, rightY, focal };
  }

  // --- The scene ------------------------------------------------------------

  function drawSkyAndSea(cam, palette, phase) {
    const sky = context.createLinearGradient(0, 0, 0, FIELD.height);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.55, palette.skyHorizon);
    sky.addColorStop(0.56, palette.seaFar);
    sky.addColorStop(1, palette.seaDeep);
    context.fillStyle = sky;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // The sun, low and warm at the day's edges.
    const sun = sunDirection(phase);
    const sunPoint = cam.project(cam.cx + sun.x * 8000, cam.cy + sun.y * 8000, cam.cz + sun.z * 8000);
    if (sunPoint && palette.sun > 0.02) {
      const glow = context.createRadialGradient(sunPoint.x, sunPoint.y, 4, sunPoint.x, sunPoint.y, 190);
      glow.addColorStop(0, `rgba(255, 190, 90, ${0.5 + palette.glow * 0.3})`);
      glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
      context.fillStyle = glow;
      context.fillRect(sunPoint.x - 190, sunPoint.y - 190, 380, 380);
      context.fillStyle = '#ffd9a0';
      context.beginPath();
      context.arc(sunPoint.x, sunPoint.y, 17, 0, Math.PI * 2);
      context.fill();
    }

    // The sea, as a polygon under the (possibly tilted) horizon line.
    const left = cam.project(cam.cx + cam.fwdX * 9000 - cam.rightX * 9000, cam.cy + cam.fwdY * 9000 - cam.rightY * 9000, cam.cz);
    const right = cam.project(cam.cx + cam.fwdX * 9000 + cam.rightX * 9000, cam.cy + cam.fwdY * 9000 + cam.rightY * 9000, cam.cz);
    if (left && right) {
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const len = Math.hypot(dx, dy) || 1;
      const ex = (dx / len) * 1800;
      const ey = (dy / len) * 1800;
      const sea = context.createLinearGradient(0, Math.min(left.y, right.y), 0, FIELD.height);
      sea.addColorStop(0, palette.seaFar);
      sea.addColorStop(1, palette.seaDeep);
      context.fillStyle = sea;
      context.beginPath();
      context.moveTo(left.x - ex, left.y - ey);
      context.lineTo(right.x + ex, right.y + ey);
      context.lineTo(right.x + ex - ey * 4, right.y + ey + Math.abs(ex) * 4 + 1600);
      context.lineTo(left.x - ex - ey * 4, left.y - ey + Math.abs(ex) * 4 + 1600);
      context.closePath();
      context.fill();
    }
  }

  const ISLAND_LEVELS = [1.0, 0.8, 0.56, 0.32, 0.14];
  const GREEN_SHADES = [PALETTE.sand, PALETTE.greenDark, PALETTE.green, PALETTE.greenLight, PALETTE.greenLight];
  const ROCK_SHADES = [PALETTE.sand, PALETTE.rockDark, PALETTE.rock, '#83878e', '#9aa0a6'];
  const PATCH_TONES = ['#3f8a58', '#275e3a', '#7fae56'];

  function ringPolygon(cam, cx, cy, radius, zAt) {
    const points = [];
    const segments = 26;
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      const p = cam.project(px, py, zAt(px, py));
      if (p === null) return null;
      points.push(p);
    }
    return points;
  }

  function fillPoints(points, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
    context.fill();
  }

  function drawIsland(cam, world, island, palette) {
    const shades = island.kind === ISLAND_VOLCANO ? ROCK_SHADES : GREEN_SHADES;
    for (let level = 0; level < ISLAND_LEVELS.length; level += 1) {
      const frac = ISLAND_LEVELS[level];
      const points = ringPolygon(cam, island.x, island.y, island.radius * frac, (px, py) => world.groundHeight(px, py) + 0.6);
      if (points) fillPoints(points, shades[level]);
    }
    // Tone patches and detail only earn their cost when the island is near.
    const dist = Math.hypot(island.x - cam.cx, island.y - cam.cy);
    if (dist < 3600) {
      for (const patch of island.patches) {
        if (Math.hypot(patch.x - island.x, patch.y - island.y) > island.radius * 0.8) continue;
        const p = cam.project(patch.x, patch.y, world.groundHeight(patch.x, patch.y) + 1.2);
        if (!p) continue;
        // Two passes, a wide faint one under a smaller stronger one, soften the edge.
        context.fillStyle = PATCH_TONES[patch.tone];
        for (const [grow, alpha] of [[1.25, 0.1], [1, 0.2]]) {
          context.globalAlpha = alpha;
          context.beginPath();
          context.ellipse(p.x, p.y, Math.max(2, patch.r * p.scale * grow), Math.max(1, patch.r * p.scale * 0.34 * grow), 0, 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
      }
    }
    if (island.kind === ISLAND_VOLCANO) {
      const top = cam.project(island.x, island.y, island.peak + 2);
      if (top) {
        context.fillStyle = PALETTE.crater;
        context.beginPath();
        context.ellipse(top.x, top.y, Math.max(3, 60 * top.scale), Math.max(2, 26 * top.scale), 0, 0, Math.PI * 2);
        context.fill();
        if (palette.glow > 0.05) {
          context.fillStyle = `rgba(255, 90, 42, ${palette.glow * 0.8})`;
          context.beginPath();
          context.ellipse(top.x, top.y, Math.max(2, 34 * top.scale), Math.max(1, 14 * top.scale), 0, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    if (dist < 3000) {
      context.fillStyle = PALETTE.greenDark;
      for (const tree of island.trees) {
        const p = cam.project(tree.x, tree.y, tree.z);
        if (!p) continue;
        const s = clamp(15 * p.scale * tree.s, 1.5, 10);
        context.beginPath();
        context.moveTo(p.x, p.y - s);
        context.lineTo(p.x - s * 0.55, p.y);
        context.lineTo(p.x + s * 0.55, p.y);
        context.closePath();
        context.fill();
      }
    }
  }

  function quad(cam, a, b, c, d, color) {
    const pa = cam.project(a.x, a.y, a.z);
    const pb = cam.project(b.x, b.y, b.z);
    const pc = cam.project(c.x, c.y, c.z);
    const pd = cam.project(d.x, d.y, d.z);
    if (!pa || !pb || !pc || !pd) return;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(pa.x, pa.y);
    context.lineTo(pb.x, pb.y);
    context.lineTo(pc.x, pc.y);
    context.lineTo(pd.x, pd.y);
    context.closePath();
    context.fill();
  }

  function groundPoint(world, x, y, lift = 0.35) {
    return { x, y, z: world.groundHeight(x, y) + lift };
  }

  function drawAirport(cam, world, state, palette) {
    const runway = world.runway;
    const elev = runway.elevation;
    const at = (along, across, lift = 0.35) => {
      const p = world.runwayPoint(along, across);
      return { x: p.x, y: p.y, z: elev + lift };
    };
    const half = runway.length / 2;
    const wide = runway.width / 2;

    // Taxiway first (it sits under the runway's edge in the drawing order).
    quad(cam, at(-half, 82 - 11), at(half, 82 - 11), at(half, 82 + 11), at(-half, 82 + 11), '#454a51');
    quad(cam, at(-8, wide), at(8, wide), at(8, 82 - 11), at(-8, 82 - 11), '#454a51');

    // The strip itself, then its painted markings.
    quad(cam, at(-half, -wide), at(half, -wide), at(half, wide), at(-half, wide), PALETTE.runway);
    quad(cam, at(-half, -wide, 0.42), at(half, -wide, 0.42), at(half, -wide + 1.1, 0.42), at(-half, -wide + 1.1, 0.42), 'rgba(244,246,248,0.75)');
    quad(cam, at(-half, wide - 1.1, 0.42), at(half, wide - 1.1, 0.42), at(half, wide, 0.42), at(-half, wide, 0.42), 'rgba(244,246,248,0.75)');
    for (let along = -330; along <= 330; along += 60) {
      quad(cam, at(along, -0.9, 0.42), at(along + 30, -0.9, 0.42), at(along + 30, 0.9, 0.42), at(along, 0.9, 0.42), 'rgba(244,246,248,0.85)');
    }
    // Piano keys at both thresholds, touchdown bars and the aiming point.
    for (const endSign of [-1, 1]) {
      for (let stripe = 0; stripe < 8; stripe += 1) {
        const across = -wide + 2.6 + stripe * ((runway.width - 5.2) / 8);
        quad(cam, at(endSign * (half - 16), across, 0.42), at(endSign * half, across, 0.42),
          at(endSign * half, across + (runway.width - 5.2) / 8 - 1.2, 0.42), at(endSign * (half - 16), across + (runway.width - 5.2) / 8 - 1.2, 0.42),
          'rgba(244,246,248,0.9)');
      }
      for (const barsAt of [150, 300, 450, 600]) {
        if (barsAt > runway.length - 130) continue;
        const along = endSign * (half - barsAt);
        const barWidth = barsAt === 300 ? 4.6 : 3.1;
        for (const side of [-1, 1]) {
          quad(cam, at(along - 11, side * 8 - barWidth / 2, 0.42), at(along + 11, side * 8 - barWidth / 2, 0.42),
            at(along + 11, side * 8 + barWidth / 2, 0.42), at(along - 11, side * 8 + barWidth / 2, 0.42), 'rgba(244,246,248,0.9)');
        }
      }
      drawRunwayNumber(cam, world, endSign, at);
    }

    // Edge, threshold and end lights; brighter as the light goes.
    const lightAlpha = clamp(0.35 + palette.glow * 0.6 + (1 - palette.sun) * 0.3, 0, 1);
    for (let along = -half; along <= half; along += 60) {
      for (const side of [-1, 1]) {
        const p = cam.project(...Object.values(at(along, side * (wide + 2), 0.8)));
        if (!p) continue;
        const nearEnd = Math.min(Math.abs(along + half), Math.abs(along - half)) < 150;
        context.fillStyle = nearEnd ? `rgba(255, 190, 80, ${lightAlpha})` : `rgba(240, 246, 255, ${lightAlpha})`;
        context.beginPath();
        context.arc(p.x, p.y, clamp(90 * p.scale, 1.2, 3.4), 0, Math.PI * 2);
        context.fill();
      }
    }
    for (const endSign of [-1, 1]) {
      for (let stepAcross = -3; stepAcross <= 3; stepAcross += 1) {
        const p = cam.project(...Object.values(at(endSign * half, stepAcross * 6.4, 0.8)));
        if (!p) continue;
        context.fillStyle = endSign === 1 ? `rgba(80, 255, 140, ${lightAlpha})` : `rgba(255, 90, 70, ${lightAlpha})`;
        context.beginPath();
        context.arc(p.x, p.y, clamp(100 * p.scale, 1.4, 3.8), 0, Math.PI * 2);
        context.fill();
      }
    }

    drawPapi(cam, world, state, lightAlpha);

    // The terminal block and its tower, then the two parked planes.
    const terminal = world.airport.terminal;
    drawBlock(cam, world, terminal);
    for (const parked of world.airport.parked) drawParkedPlane(cam, world, parked);
  }

  function drawRunwayNumber(cam, world, endSign, at) {
    const runway = world.runway;
    // Numbers sit 60 m past their threshold, painted to be read on the approach:
    // "09" at the west end for eastbound landings, "27" at the east end for westbound.
    const label = endSign === 1 ? '27' : '09';
    const along = endSign * (runway.length / 2 - 62);
    const centre = at(along, 0, 0.5);
    const ahead = at(along - endSign * 14, 0, 0.5);
    const pc = cam.project(centre.x, centre.y, centre.z);
    const pa = cam.project(ahead.x, ahead.y, ahead.z);
    if (!pc || !pa) return;
    const size = clamp(12.5 * pc.scale, 4, 64);
    if (size < 5) return;
    const angle = Math.atan2(pa.y - pc.y, pa.x - pc.x) + Math.PI / 2;
    context.save();
    context.translate(pc.x, pc.y);
    context.rotate(angle);
    context.font = fontFor(size, '700');
    context.fillStyle = 'rgba(244,246,248,0.92)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 0, 0);
    context.restore();
  }

  /** The four PAPI lights beside the 27 touchdown zone: white over red on the path. */
  function drawPapi(cam, world, state, lightAlpha) {
    const runway = world.runway;
    const elev = runway.elevation;
    // Deviation from the 3-degree path to the aiming point, from the plane's own state.
    const thrX = runway.x + runway.dirX * (runway.length / 2);
    const thrY = runway.y + runway.dirY * (runway.length / 2);
    const distOut = (thrX - state.x) * -runway.dirX + (thrY - state.y) * -runway.dirY;
    const frame = world.runwayFrame(state.x, state.y);
    const lateralDeg = Math.abs(Math.atan2(frame.across, Math.max(60, distOut))) * (180 / Math.PI);
    let whites = 2;
    if (distOut > 0 && lateralDeg < 15) {
      const expected = distOut * Math.tan((3 * Math.PI) / 180);
      const ratio = (state.z - elev) / Math.max(8, expected);
      whites = ratio > 1.18 ? 4 : ratio > 1.06 ? 3 : ratio > 0.94 ? 2 : ratio > 0.84 ? 1 : 0;
    }
    for (let index = 0; index < 4; index += 1) {
      const p = world.runwayPoint(runway.length / 2 - 300, 32 + index * 7);
      const pp = cam.project(p.x, p.y, elev + 1.2);
      if (!pp) continue;
      const lit = distOut > 0 && lateralDeg < 15;
      context.fillStyle = index < whites
        ? `rgba(255, 250, 235, ${lit ? lightAlpha : lightAlpha * 0.4})`
        : `rgba(255, 70, 55, ${lit ? lightAlpha : lightAlpha * 0.4})`;
      context.beginPath();
      context.arc(pp.x, pp.y, clamp(120 * pp.scale, 1.6, 4.6), 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawBlock(cam, world, block) {
    const runway = world.runway;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const x = block.x + runway.dirX * (sx * block.width / 2) + runway.perpX * (sy * block.depth / 2);
      const y = block.y + runway.dirY * (sx * block.width / 2) + runway.perpY * (sy * block.depth / 2);
      return { x, y, g: world.groundHeight(x, y) };
    });
    const projected = corners.map((c) => ({
      base: cam.project(c.x, c.y, c.g + 0.3),
      top: cam.project(c.x, c.y, c.g + block.height),
    }));
    if (projected.some((p) => !p.base || !p.top)) return;
    for (let side = 0; side < 4; side += 1) {
      const a = projected[side];
      const b = projected[(side + 1) % 4];
      context.fillStyle = side % 2 === 0 ? '#5a5148' : '#6e6357';
      context.beginPath();
      context.moveTo(a.base.x, a.base.y);
      context.lineTo(b.base.x, b.base.y);
      context.lineTo(b.top.x, b.top.y);
      context.lineTo(a.top.x, a.top.y);
      context.closePath();
      context.fill();
    }
    context.fillStyle = '#8b7f70';
    context.beginPath();
    context.moveTo(projected[0].top.x, projected[0].top.y);
    for (let index = 1; index < 4; index += 1) context.lineTo(projected[index].top.x, projected[index].top.y);
    context.closePath();
    context.fill();
  }

  function drawParkedPlane(cam, world, parked) {
    const p = cam.project(parked.x, parked.y, world.groundHeight(parked.x, parked.y) + 1.6);
    if (!p || p.d > 3200) return;
    const ahead = cam.project(parked.x + Math.sin(parked.heading) * 12, parked.y + Math.cos(parked.heading) * 12, world.groundHeight(parked.x, parked.y) + 1.6);
    if (!ahead) return;
    const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x) + Math.PI / 2;
    const s = p.scale;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(angle);
    context.scale(s, s);
    context.fillStyle = '#e8e6df';
    context.beginPath();
    context.ellipse(0, 0, 1.6, 6.4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-5.6, -0.6, 11.2, 2.4);
    context.fillRect(-2.8, 5.2, 5.6, 1.6);
    context.fillStyle = PALETTE.amber;
    context.fillRect(-0.7, -6.4, 1.4, 12.8);
    context.restore();
  }

  // --- Rings, clouds, the plane ----------------------------------------------

  function drawRings(cam, state) {
    if (state.mode !== MODE_COURSE || !state.course) return;
    state.course.rings.forEach((ring, index) => {
      if (index < state.nextRing) return;
      const isNext = index === state.nextRing;
      const segs = 22;
      const points = [];
      let visible = true;
      // The ring stands in the vertical plane across its flight direction: its right
      // vector is the normal (nx, ny) turned a quarter turn.
      const rightX = ring.ny;
      const rightY = -ring.nx;
      for (let s = 0; s < segs; s += 1) {
        const a = (s / segs) * Math.PI * 2;
        const p = cam.project(
          ring.x + Math.cos(a) * ring.radius * rightX,
          ring.y + Math.cos(a) * ring.radius * rightY,
          ring.z + Math.sin(a) * ring.radius,
        );
        if (!p) { visible = false; break; }
        points.push(p);
      }
      if (!visible) return;
      context.strokeStyle = isNext ? PALETTE.amber : 'rgba(244, 246, 248, 0.5)';
      context.lineWidth = isNext ? clamp(260 * points[0].scale, 2, 7) : clamp(160 * points[0].scale, 1, 4);
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let s = 1; s < segs; s += 1) context.lineTo(points[s].x, points[s].y);
      context.closePath();
      context.stroke();
      if (isNext) {
        const top = points.reduce((best, p) => (p.y < best.y ? p : best), points[0]);
        text(String(index + 1), top.x, top.y - 10, 22, PALETTE.amber, 'center', '700');
      }
    });
  }

  function drawClouds(cam, world, state, viewKind) {
    const driftX = Math.sin(world.wind.heading) * state.elapsed * 2.2;
    const driftY = Math.cos(world.wind.heading) * state.elapsed * 2.2;
    let inside = 0;
    for (const cloud of world.clouds) {
      let cxp = cloud.x + driftX;
      let cyp = cloud.y + driftY;
      cxp = ((cxp + WORLD_EXTENT) % (WORLD_EXTENT * 2)) - WORLD_EXTENT;
      cyp = ((cyp + WORLD_EXTENT) % (WORLD_EXTENT * 2)) - WORLD_EXTENT;
      const distToCam = Math.hypot(cxp - cam.cx, cyp - cam.cy);
      if (Math.abs(state.z - cloud.z) < 46 && distToCam < cloud.r * 0.95) inside = Math.max(inside, 1 - distToCam / cloud.r);
      const p = cam.project(cxp, cyp, cloud.z);
      if (!p || p.d < cloud.r * 0.7) continue;
      context.fillStyle = 'rgba(250, 252, 255, 0.6)';
      for (const [ox, oy, orad] of [[0, 0, 1], [-0.55, 0.12, 0.66], [0.55, 0.1, 0.7], [0.1, -0.22, 0.6]]) {
        context.beginPath();
        context.ellipse(p.x + ox * cloud.r * p.scale, p.y + oy * cloud.r * p.scale * 0.4,
          Math.max(3, cloud.r * orad * p.scale), Math.max(2, cloud.r * orad * p.scale * 0.36), 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (inside > 0) {
      context.fillStyle = `rgba(248, 250, 252, ${clamp(inside * 0.75, 0, 0.7)})`;
      context.fillRect(0, 0, FIELD.width, viewKind === VIEW_COCKPIT ? PANEL_TOP : FIELD.height);
    }
  }

  function drawPlaneChase(cam, state) {
    // A soft shadow on the surface below ties the plane to the world.
    const ground = state.world.groundHeight(state.x, state.y);
    const shadow = cam.project(state.x, state.y, ground + 0.8);
    if (shadow && state.z - ground < 260) {
      const closeness = 1 - (state.z - ground) / 260;
      context.fillStyle = `rgba(4, 20, 26, ${0.34 * closeness})`;
      context.beginPath();
      context.ellipse(shadow.x, shadow.y, Math.max(3, 30 * shadow.scale), Math.max(2, 11 * shadow.scale), 0, 0, Math.PI * 2);
      context.fill();
    }
    const p = cam.project(state.x, state.y, state.z);
    if (!p) return;
    const s = clamp(p.scale, 0.5, 1.6);
    context.save();
    context.translate(FIELD.width / 2, FIELD.height * 0.56);
    context.rotate(-state.roll * 0.55);
    context.scale(s, s);
    // The prop, a blurred disc with a spinner.
    context.fillStyle = 'rgba(230, 238, 242, 0.30)';
    context.beginPath();
    context.ellipse(0, 26, 30, 7.5, 0, 0, Math.PI * 2);
    context.fill();
    // Tail, fuselage, wing, canopy, tailplane.
    context.fillStyle = '#c33d2e';
    context.beginPath();
    context.moveTo(-3.4, -34);
    context.lineTo(0, -48);
    context.lineTo(3.4, -34);
    context.closePath();
    context.fill();
    const body = context.createLinearGradient(-7, 0, 7, 0);
    body.addColorStop(0, '#d8d3c3');
    body.addColorStop(0.5, '#f4f1e6');
    body.addColorStop(1, '#c9c2ae');
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(0, 0, 6.8, 34, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.amber;
    context.fillRect(-6.8, -2, 13.6, 4.5);
    context.fillStyle = '#e8e4d4';
    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(-40, 7);
    context.lineTo(-40, 13);
    context.lineTo(0, 6);
    context.lineTo(40, 13);
    context.lineTo(40, 7);
    context.closePath();
    context.fill();
    context.fillStyle = '#22303a';
    context.beginPath();
    context.ellipse(0, -7, 4.4, 8.5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8e4d4';
    context.fillRect(-13, -36, 26, 4.6);
    context.fillStyle = '#8f2d23';
    context.beginPath();
    context.arc(0, 26, 3.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCockpitFrame(cam, state) {
    // The nose and cowling at the bottom of the windscreen, and the prop's blur.
    context.fillStyle = '#23262c';
    context.beginPath();
    context.moveTo(FIELD.width * 0.30, PANEL_TOP + 6);
    context.quadraticCurveTo(FIELD.width / 2, PANEL_TOP - 64, FIELD.width * 0.70, PANEL_TOP + 6);
    context.lineTo(FIELD.width * 0.70, PANEL_TOP + 26);
    context.lineTo(FIELD.width * 0.30, PANEL_TOP + 26);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(235, 240, 244, 0.16)';
    context.beginPath();
    context.ellipse(FIELD.width / 2, PANEL_TOP - 26, 120, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#17191d';
    context.beginPath();
    context.arc(FIELD.width / 2, PANEL_TOP - 26, 9, 0, Math.PI * 2);
    context.fill();
  }

  // --- The chase HUD ----------------------------------------------------------

  function formatClock(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function drawCompassStrip(state, cx, y) {
    const w = 340;
    panel(cx - w / 2, y, w, 40, 0.62);
    context.save();
    context.beginPath();
    context.rect(cx - w / 2 + 6, y + 3, w - 12, 34);
    context.clip();
    const degPerPx = 0.55;
    const headingDeg = ((state.heading * 180) / Math.PI + 360) % 360;
    for (let offset = -Math.ceil((w / 2) * degPerPx); offset <= Math.ceil((w / 2) * degPerPx); offset += 5) {
      const deg = ((Math.round((headingDeg + offset) / 5) * 5) % 360 + 360) % 360;
      const x = cx + (deg - headingDeg) / degPerPx;
      if (deg % 30 === 0) {
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10).padStart(2, '0');
        text(label, x, y + 27, 15, PALETTE.white, 'center', '700');
      } else {
        context.fillStyle = 'rgba(244,246,248,0.5)';
        context.fillRect(x - 0.5, y + 24, 1, 7);
      }
    }
    context.restore();
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(cx - 6, y - 1);
    context.lineTo(cx + 6, y - 1);
    context.lineTo(cx, y + 8);
    context.closePath();
    context.fill();
  }

  function drawMinimap(state, x, y, size) {
    const world = state.world;
    panel(x, y, size, size, 0.62);
    const toMap = (wx, wy) => [
      x + size / 2 + (wx / WORLD_EXTENT) * (size / 2 - 8),
      y + size / 2 - (wy / WORLD_EXTENT) * (size / 2 - 8),
    ];
    for (const island of world.islands) {
      const [ix, iy] = toMap(island.x, island.y);
      context.fillStyle = island.kind === ISLAND_VOLCANO ? PALETTE.rock : PALETTE.green;
      context.beginPath();
      context.arc(ix, iy, Math.max(2.5, (island.radius / WORLD_EXTENT) * (size / 2 - 8)), 0, Math.PI * 2);
      context.fill();
    }
    const rp1 = toMap(world.runway.x - world.runway.dirX * world.runway.length / 2, world.runway.y - world.runway.dirY * world.runway.length / 2);
    const rp2 = toMap(world.runway.x + world.runway.dirX * world.runway.length / 2, world.runway.y + world.runway.dirY * world.runway.length / 2);
    context.strokeStyle = PALETTE.white;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(rp1[0], rp1[1]);
    context.lineTo(rp2[0], rp2[1]);
    context.stroke();
    if (state.mode === MODE_COURSE && state.course) {
      state.course.rings.forEach((ring, index) => {
        if (index < state.nextRing) return;
        const [rx, ry] = toMap(ring.x, ring.y);
        context.fillStyle = index === state.nextRing ? PALETTE.amber : 'rgba(244,246,248,0.55)';
        context.beginPath();
        context.arc(rx, ry, index === state.nextRing ? 3.6 : 2.4, 0, Math.PI * 2);
        context.fill();
      });
    }
    const [px, py] = toMap(state.x, state.y);
    context.save();
    context.translate(px, py);
    context.rotate(state.heading);
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(0, -6.5);
    context.lineTo(4.4, 5);
    context.lineTo(0, 2.6);
    context.lineTo(-4.4, 5);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawCallout(state, y) {
    if (state.calloutTtl <= 0 || state.callout === '') return;
    context.font = fontFor(19, '700');
    const w = context.measureText(state.callout).width + 92;
    panel(FIELD.width / 2 - w / 2, y, w, 38, 0.8);
    text('RADIO', FIELD.width / 2 - w / 2 + 16, y + 26, 13, PALETTE.amber, 'left', '700');
    text(`"${state.callout}"`, FIELD.width / 2 - w / 2 + 74, y + 26, 19, PALETTE.cream, 'left', '');
  }

  function drawWarnings(state) {
    const knots = state.speed * UNITS.knotsPerMs;
    const warnings = [];
    if (state.stalled) warnings.push('STALL');
    if (state.fuel > 0 && state.fuel < 20) warnings.push('LOW FUEL');
    if (knots > ASI.redline) warnings.push('OVERSPEED');
    if (state.mode === MODE_LANDING && state.flapDeg < 25 && state.z - state.world.runway.elevation < 120) warnings.push('FLAPS NOT FULL');
    warnings.forEach((label, index) => {
      const w = 190;
      const x = FIELD.width / 2 - w / 2;
      const y = 128 + index * 44;
      context.fillStyle = 'rgba(150, 30, 22, 0.85)';
      context.beginPath();
      context.roundRect(x, y, w, 36, 8);
      context.fill();
      text(label, FIELD.width / 2, y + 25, 17, '#ffe9e4', 'center', '700');
    });
  }

  function drawHudChase(state, ui) {
    const knots = Math.round(state.speed * UNITS.knotsPerMs);
    const altFt = Math.round(state.z * UNITS.feetPerMetre);
    const vsFpm = Math.round(state.vspeed * UNITS.feetPerMetre * 60);
    panel(28, 24, 218, 132, 0.72);
    text('ALTITUDE', 44, 52, 13, PALETTE.muted, 'left', '700');
    text(`${altFt} ft`, 44, 84, 27, PALETTE.white, 'left', '700');
    text('AIRSPEED', 44, 112, 13, PALETTE.muted, 'left', '700');
    text(`${knots} kt`, 44, 144, 27, PALETTE.white, 'left', '700');

    panel(FIELD.width - 246, 24, 218, 132, 0.72);
    text('VERT SPEED', FIELD.width - 230, 52, 13, PALETTE.muted, 'left', '700');
    text(`${vsFpm >= 0 ? '+' : ''}${vsFpm} fpm`, FIELD.width - 230, 84, 24, PALETTE.white, 'left', '700');
    text('THROTTLE', FIELD.width - 230, 112, 13, PALETTE.muted, 'left', '700');
    context.fillStyle = 'rgba(244,246,248,0.18)';
    context.fillRect(FIELD.width - 230, 122, 150, 13);
    context.fillStyle = PALETTE.amber;
    context.fillRect(FIELD.width - 230, 122, 150 * state.throttle, 13);
    text(`${Math.round(state.rpm)}`, FIELD.width - 66, 136, 15, PALETTE.cream, 'right', '700');

    // Fuel and flaps, bottom left; course progress and the clock, bottom right.
    panel(28, FIELD.height - 118, 250, 90, 0.72);
    text('FUEL', 44, FIELD.height - 90, 13, PALETTE.muted, 'left', '700');
    context.fillStyle = 'rgba(244,246,248,0.18)';
    context.fillRect(44, FIELD.height - 80, 170, 13);
    context.fillStyle = state.fuel < 20 ? '#e0483a' : PALETTE.amber;
    context.fillRect(44, FIELD.height - 80, 170 * clamp(state.fuel / 100, 0, 1), 13);
    text(`FLAPS ${Math.round(state.flapDeg)}°`, 44, FIELD.height - 42, 16, PALETTE.cream, 'left', '700');
    text(`WIND ${Math.round(state.windNow * UNITS.knotsPerMs)} kt${state.gustsOn ? ' G' : ''}`, 150, FIELD.height - 42, 16, PALETTE.cream, 'left', '700');

    if (state.mode === MODE_COURSE && state.course) {
      panel(FIELD.width - 278, FIELD.height - 118, 250, 90, 0.72);
      text(state.course.name.toUpperCase(), FIELD.width - 262, FIELD.height - 90, 13, PALETTE.muted, 'left', '700');
      text(`Ring ${Math.min(state.nextRing + 1, state.course.rings.length)} of ${state.course.rings.length}`, FIELD.width - 262, FIELD.height - 62, 20, PALETTE.white, 'left', '700');
      text(formatClock(state.time), FIELD.width - 44, FIELD.height - 62, 20, PALETTE.amber, 'right', '700');
      const ring = state.course.rings[state.nextRing];
      if (ring) {
        const dist = Math.hypot(ring.x - state.x, ring.y - state.y);
        text(`${Math.round(dist)} m`, FIELD.width - 262, FIELD.height - 38, 15, PALETTE.cream, 'left', '');
        // A screen-edge arrow toward the next ring.
        const rel = Math.atan2(ring.x - state.x, ring.y - state.y) - state.heading;
        const ax = FIELD.width / 2 + Math.sin(rel) * 120;
        const ay = FIELD.height / 2 - Math.cos(rel) * 120;
        context.save();
        context.translate(ax, ay);
        context.rotate(rel);
        context.fillStyle = PALETTE.amber;
        context.beginPath();
        context.moveTo(0, -13);
        context.lineTo(8, 9);
        context.lineTo(0, 4);
        context.lineTo(-8, 9);
        context.closePath();
        context.fill();
        context.restore();
      }
    } else if (state.mode === MODE_LANDING) {
      panel(FIELD.width - 278, FIELD.height - 118, 250, 90, 0.72);
      text('LANDING — RUNWAY 27', FIELD.width - 262, FIELD.height - 90, 13, PALETTE.muted, 'left', '700');
      text(formatClock(state.time), FIELD.width - 262, FIELD.height - 62, 20, PALETTE.white, 'left', '700');
      text('Aim for the big bars, 300 m in', FIELD.width - 262, FIELD.height - 38, 15, PALETTE.cream, 'left', '');
    } else {
      panel(FIELD.width - 278, FIELD.height - 76, 250, 48, 0.72);
      text(`FREE FLIGHT  ${formatClock(state.time)}`, FIELD.width - 262, FIELD.height - 46, 16, PALETTE.white, 'left', '700');
    }

    drawCompassStrip(state, FIELD.width / 2, 24);
    drawMinimap(state, FIELD.width - 176, FIELD.height - 300, 148);
    drawWarnings(state);
    if (state.messageTtl > 0) text(state.message, FIELD.width / 2, 216, 26, PALETTE.amber, 'center', '700');
    drawCallout(state, FIELD.height - 178);
    text(ui.view === VIEW_COCKPIT ? '' : 'C cockpit view · F flaps · P pause', FIELD.width / 2, FIELD.height - 12, 13, 'rgba(244,246,248,0.55)', 'center', '');
  }

  // --- The cockpit panel -------------------------------------------------------

  function polar(cx, cy, r, a) {
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function gaugeFace(cx, cy, r) {
    context.fillStyle = '#26282e';
    context.beginPath();
    context.arc(cx, cy, r + 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#101216';
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
  }

  function needle(cx, cy, len, a, color, width) {
    const [x, y] = polar(cx, cy, len, a);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(x, y);
    context.stroke();
    context.fillStyle = '#d8d3c3';
    context.beginPath();
    context.arc(cx, cy, 3.4, 0, Math.PI * 2);
    context.fill();
  }

  function tick(cx, cy, r, a, len, color, width = 1.6) {
    const [x1, y1] = polar(cx, cy, r, a);
    const [x2, y2] = polar(cx, cy, r - len, a);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }

  function arcBand(cx, cy, r, a1, a2, color, width) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.arc(cx, cy, r, a1, a2);
    context.stroke();
  }

  function asiAngle(knots) {
    return Math.PI * 0.8 + (clamp(knots, 0, ASI.max) / ASI.max) * Math.PI * 1.75;
  }

  function drawAsi(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    arcBand(cx, cy, r - 7, asiAngle(ASI.whiteFrom), asiAngle(ASI.whiteTo), '#e8e6df', 5);
    arcBand(cx, cy, r - 7, asiAngle(ASI.greenFrom), asiAngle(ASI.greenTo), '#3fae5a', 5);
    arcBand(cx, cy, r - 7, asiAngle(ASI.greenTo), asiAngle(ASI.yellowTo), '#e8c33a', 5);
    tick(cx, cy, r - 2, asiAngle(ASI.redline), 12, '#e0483a', 3);
    for (let v = 0; v <= 170; v += 10) {
      const a = asiAngle(v);
      tick(cx, cy, r - 2, a, v % 20 === 0 ? 9 : 5, PALETTE.cream, 1.4);
      if (v % 20 === 0 && v > 0) {
        const [lx, ly] = polar(cx, cy, r - 22, a);
        text(String(v), lx, ly + 4, 11, PALETTE.cream, 'center', '700');
      }
    }
    needle(cx, cy, r - 14, asiAngle(state.speed * UNITS.knotsPerMs), PALETTE.cream, 2.6);
    text('KNOTS', cx, cy + r * 0.52, 10, PALETTE.muted, 'center', '700');
  }

  function drawAttitude(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    context.save();
    context.beginPath();
    context.arc(cx, cy, r - 3, 0, Math.PI * 2);
    context.clip();
    const pxPerRad = r * 1.6;
    context.translate(cx, cy);
    context.rotate(-state.roll);
    context.translate(0, clamp(state.pitch, -0.6, 0.6) * pxPerRad);
    context.fillStyle = '#4178a8';
    context.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
    context.fillStyle = '#6e4f30';
    context.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
    context.strokeStyle = '#f4f6f8';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-r * 1.6, 0);
    context.lineTo(r * 1.6, 0);
    context.stroke();
    context.lineWidth = 1.6;
    for (const deg of [-20, -10, 10, 20]) {
      const y = -(deg * Math.PI / 180) * pxPerRad;
      const w = deg % 20 === 0 ? r * 0.42 : r * 0.26;
      context.beginPath();
      context.moveTo(-w, y);
      context.lineTo(w, y);
      context.stroke();
    }
    context.restore();
    // Bank index marks, fixed; the ball's pointer rides with the roll.
    for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = -Math.PI / 2 + (deg * Math.PI) / 180;
      tick(cx, cy, r - 3, a, deg === 0 ? 10 : 6, PALETTE.cream, 1.6);
    }
    const pa = -Math.PI / 2 - state.roll;
    const [px, py] = polar(cx, cy, r - 13, pa);
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(px, py);
    const [lx, ly] = polar(cx, cy, r - 22, pa - 0.1);
    const [rx, ry] = polar(cx, cy, r - 22, pa + 0.1);
    context.lineTo(lx, ly);
    context.lineTo(rx, ry);
    context.closePath();
    context.fill();
    // The fixed miniature aeroplane.
    context.strokeStyle = PALETTE.amber;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - r * 0.52, cy);
    context.lineTo(cx - r * 0.16, cy);
    context.lineTo(cx - r * 0.16, cy + 6);
    context.moveTo(cx + r * 0.52, cy);
    context.lineTo(cx + r * 0.16, cy);
    context.lineTo(cx + r * 0.16, cy + 6);
    context.stroke();
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.arc(cx, cy, 3.2, 0, Math.PI * 2);
    context.fill();
  }

  function drawAltimeter(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    const altFt = state.z * UNITS.feetPerMetre;
    for (let n = 0; n < 10; n += 1) {
      const a = -Math.PI / 2 + (n / 10) * Math.PI * 2;
      tick(cx, cy, r - 2, a, 8, PALETTE.cream, 1.6);
      const [lx, ly] = polar(cx, cy, r - 17, a);
      text(String(n), lx, ly + 5, 13, PALETTE.cream, 'center', '700');
    }
    needle(cx, cy, r * 0.52, -Math.PI / 2 + ((altFt % 10000) / 10000) * Math.PI * 2, PALETTE.cream, 4.4);
    needle(cx, cy, r - 13, -Math.PI / 2 + ((altFt % 1000) / 1000) * Math.PI * 2, PALETTE.cream, 2);
    // The drum window shows the thousands, the small window the pressure setting.
    context.fillStyle = '#000';
    context.fillRect(cx + r * 0.16, cy - 9, 26, 18);
    context.strokeStyle = 'rgba(244,246,248,0.4)';
    context.lineWidth = 1;
    context.strokeRect(cx + r * 0.16, cy - 9, 26, 18);
    text(String(Math.floor(altFt / 1000)), cx + r * 0.16 + 21, cy + 5, 13, PALETTE.white, 'right', '700');
    text('29.92 IN', cx, cy + r * 0.58, 9, PALETTE.muted, 'center', '700');
  }

  function drawTurnCoordinator(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    context.save();
    context.translate(cx, cy - 6);
    context.rotate(state.roll * 0.85);
    context.fillStyle = PALETTE.cream;
    context.beginPath();
    context.ellipse(0, 0, 2.4, 11, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-14, -1.8, 28, 3.6);
    context.fillRect(-5.5, 8, 11, 2.6);
    context.restore();
    // The ball in its curved tube: centred in a coordinated turn, out with the slip.
    arcBand(cx, cy, r * 0.8, Math.PI * 0.18, Math.PI * 0.82, 'rgba(244,246,248,0.3)', 8);
    const slip = clamp(state.turnRate - Math.sin(state.roll) * 1.02, -0.8, 0.8);
    const [bx, by] = polar(cx, cy, r * 0.8, Math.PI / 2 + slip * 0.45);
    context.fillStyle = '#0c0e11';
    context.beginPath();
    context.arc(bx, by, 5.4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.cream;
    context.lineWidth = 1.2;
    context.stroke();
    text('TURN', cx, cy + r * 0.6, 9, PALETTE.muted, 'center', '700');
  }

  function drawHeadingGauge(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180 - state.heading - Math.PI / 2;
      tick(cx, cy, r - 2, a, deg % 30 === 0 ? 8 : 4, 'rgba(244,246,248,0.65)', 1.3);
      if (deg % 30 === 0) {
        const [lx, ly] = polar(cx, cy, r - 18, a);
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10);
        text(label, lx, ly + 5, deg % 90 === 0 ? 14 : 11, PALETTE.cream, 'center', '700');
      }
    }
    context.strokeStyle = PALETTE.amber;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cx, cy + 11);
    context.lineTo(cx - 7, cy + 4);
    context.lineTo(cx, cy - 12);
    context.lineTo(cx + 7, cy + 4);
    context.closePath();
    context.stroke();
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(cx - 5, cy - r + 3);
    context.lineTo(cx + 5, cy - r + 3);
    context.lineTo(cx, cy - r + 11);
    context.closePath();
    context.fill();
    const headingDeg = Math.round(((state.heading * 180) / Math.PI + 360) % 360);
    text(`${String(headingDeg).padStart(3, '0')}°`, cx, cy + r * 0.62, 12, PALETTE.cream, 'center', '700');
  }

  function drawVsi(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    const fpm = state.vspeed * UNITS.feetPerMetre * 60;
    for (const v of [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 2000]) {
      const a = Math.PI + (v / 2000) * Math.PI * 0.83;
      tick(cx, cy, r - 2, a, 7, PALETTE.cream, 1.4);
      const [lx, ly] = polar(cx, cy, r - 16, a);
      text(String(Math.abs(v) / 100), lx, ly + 4, 10, PALETTE.cream, 'center', '700');
    }
    const a = Math.PI + (clamp(fpm, -2000, 2000) / 2000) * Math.PI * 0.83;
    needle(cx, cy, r - 13, a, PALETTE.cream, 2.4);
    text('VERT SPEED', cx, cy + r * 0.55, 8.5, PALETTE.muted, 'center', '700');
  }

  function drawRpm(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    const angle = (v) => Math.PI * 0.8 + (clamp(v, 0, 3000) / 3000) * Math.PI * 1.75;
    arcBand(cx, cy, r - 6, angle(RPM.greenFrom), angle(RPM.greenTo), '#3fae5a', 5);
    tick(cx, cy, r - 2, angle(RPM.redline), 11, '#e0483a', 3);
    for (let v = 0; v <= 3000; v += 500) {
      const a = angle(v);
      tick(cx, cy, r - 2, a, 6, PALETTE.cream, 1.3);
      if (v % 1000 === 0) {
        const [lx, ly] = polar(cx, cy, r - 16, a);
        text(String(v / 100), lx, ly + 4, 11, PALETTE.cream, 'center', '700');
      }
    }
    needle(cx, cy, r - 12, angle(state.rpm), PALETTE.amber, 2.4);
    text('RPM ×100', cx, cy + r * 0.55, 9, PALETTE.muted, 'center', '700');
  }

  function drawFuel(cx, cy, r, state) {
    gaugeFace(cx, cy, r);
    const angle = (f) => Math.PI * 0.75 + clamp(f, 0, 1) * Math.PI * 1.5;
    arcBand(cx, cy, r - 6, angle(0), angle(0.25), '#e0483a', 5);
    for (const [f, label] of [[0, 'E'], [0.5, '½'], [1, 'F']]) {
      const a = angle(f);
      tick(cx, cy, r - 2, a, 7, PALETTE.cream, 1.4);
      const [lx, ly] = polar(cx, cy, r - 16, a);
      text(label, lx, ly + 4, 11, PALETTE.cream, 'center', '700');
    }
    needle(cx, cy, r - 12, angle(state.fuel / 100), PALETTE.amber, 2.4);
    text('FUEL', cx, cy + r * 0.55, 9, PALETTE.muted, 'center', '700');
  }

  function drawCockpit(state, ui) {
    // Panel body and glareshield.
    const grad = context.createLinearGradient(0, PANEL_TOP, 0, FIELD.height);
    grad.addColorStop(0, '#1b1e23');
    grad.addColorStop(1, '#0e1013');
    context.fillStyle = grad;
    context.fillRect(0, PANEL_TOP, FIELD.width, FIELD.height - PANEL_TOP);
    context.fillStyle = '#08090b';
    context.fillRect(0, PANEL_TOP, FIELD.width, 15);
    context.fillStyle = 'rgba(255, 180, 58, 0.25)';
    context.fillRect(0, PANEL_TOP + 15, FIELD.width, 1.5);
    text('ARCHIPELAGO SKYWAYS · C172 CLASS', 36, PANEL_TOP + 38, 11, 'rgba(244,246,248,0.4)', 'left', '700');

    // The six-pack: airspeed, attitude, altimeter over turn, heading, vertical speed.
    drawAsi(168, 512, 56, state);
    drawAttitude(336, 512, 56, state);
    drawAltimeter(504, 512, 56, state);
    drawTurnCoordinator(168, 644, 56, state);
    drawHeadingGauge(336, 644, 56, state);
    drawVsi(504, 644, 56, state);
    drawRpm(668, 508, 46, state);
    drawFuel(668, 648, 46, state);

    // Radio stack: frequencies and the GPS line for the sortie.
    context.fillStyle = '#0a0c0f';
    context.beginPath();
    context.roundRect(730, 448, 208, 112, 8);
    context.fill();
    context.strokeStyle = PALETTE.panelLine;
    context.stroke();
    text('COM  118.70', 744, 480, 17, '#7dff8a', 'left', '700');
    text('NAV  110.30', 744, 506, 17, PALETTE.amber, 'left', '700');
    const gps = state.mode === MODE_LANDING ? 'GPS  FINAL RWY 27'
      : state.mode === MODE_COURSE && state.course ? `GPS  ${state.course.name.toUpperCase()} · RNG ${Math.min(state.nextRing + 1, state.course.rings.length)}`
        : 'GPS  FREE FLIGHT';
    text(gps, 744, 534, 12.5, PALETTE.cream, 'left', '700');
    text('XPNDR 1200 · ALT', 744, 552, 10.5, PALETTE.muted, 'left', '');

    // Flap indicator: a slot with detents, the pointer riding the real flap angle.
    text('FLAPS', 776, 592, 11, PALETTE.muted, 'center', '700');
    context.fillStyle = '#0a0c0f';
    context.beginPath();
    context.roundRect(756, 600, 40, 100, 6);
    context.fill();
    context.strokeStyle = PALETTE.panelLine;
    context.stroke();
    for (const deg of [0, 10, 20, 30]) {
      const y = 610 + (deg / 30) * 80;
      context.fillStyle = 'rgba(244,246,248,0.5)';
      context.fillRect(762, y - 1, 12, 2);
      text(String(deg), 806, y + 4, 11, PALETTE.cream, 'left', '700');
    }
    const pointerY = 610 + (state.flapDeg / 30) * 80;
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(796, pointerY);
    context.lineTo(786, pointerY - 6);
    context.lineTo(786, pointerY + 6);
    context.closePath();
    context.fill();

    // Digital readouts and the wind, top right of the panel.
    const knots = Math.round(state.speed * UNITS.knotsPerMs);
    const altFt = Math.round(state.z * UNITS.feetPerMetre);
    const headingDeg = Math.round(((state.heading * 180) / Math.PI + 360) % 360);
    const boxes = [['HDG', `${String(headingDeg).padStart(3, '0')}°`], ['ALT', `${altFt}`], ['SPD', `${knots}`]];
    boxes.forEach(([label, value], index) => {
      const x = 958 + index * 100;
      panel(x, 448, 92, 52, 0.9);
      text(label, x + 10, 470, 10.5, PALETTE.muted, 'left', '700');
      text(value, x + 10, 493, 20, PALETTE.cream, 'left', '700');
    });
    panel(958, 512, 292, 46, 0.9);
    const windDeg = Math.round(((state.world.wind.angle * 180) / Math.PI + 180 + 360) % 360);
    text(`WIND ${String(windDeg).padStart(3, '0')}° / ${Math.round(state.windNow * UNITS.knotsPerMs)} KT`, 970, 541, 15.5, PALETTE.cream, 'left', '700');
    text(state.gustsOn ? 'GUSTS ON' : 'GUSTS OFF', 1238, 541, 12, state.gustsOn ? PALETTE.amber : PALETTE.muted, 'right', '700');

    // Throttle quadrant and the red mixture knob, fixed rich on a 172.
    text('THROTTLE', 986, 592, 10.5, PALETTE.muted, 'center', '700');
    context.fillStyle = '#0a0c0f';
    context.fillRect(980, 600, 12, 76);
    const knobY = 672 - state.throttle * 68;
    context.fillStyle = '#26282e';
    context.beginPath();
    context.roundRect(968, knobY - 9, 36, 18, 5);
    context.fill();
    context.strokeStyle = 'rgba(244,246,248,0.35)';
    context.stroke();
    text('MIXTURE', 1052, 592, 10.5, PALETTE.muted, 'center', '700');
    context.fillStyle = '#0a0c0f';
    context.fillRect(1046, 600, 12, 76);
    context.fillStyle = '#b3352b';
    context.beginPath();
    context.arc(1052, 608, 10, 0, Math.PI * 2);
    context.fill();
    text('RICH', 1052, 692, 9.5, PALETTE.muted, 'center', '700');

    // The yoke, bottom right, rolling and pushing with the pilot's hands.
    context.save();
    context.translate(1176, 664 - ui.pitchIn * 16);
    context.rotate(-ui.rollIn * 0.55);
    context.fillStyle = '#101215';
    context.fillRect(-7, 6, 14, 60);
    context.fillStyle = '#22242a';
    context.beginPath();
    context.roundRect(-64, -13, 128, 21, 10);
    context.fill();
    context.beginPath();
    context.arc(-56, -3, 11, 0, Math.PI * 2);
    context.arc(56, -3, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.arc(0, -3, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();

    drawWarnings(state);
    if (state.messageTtl > 0) text(state.message, FIELD.width / 2, 300, 26, PALETTE.amber, 'center', '700');
    drawCallout(state, PANEL_TOP - 54);
  }

  // --- Screens -----------------------------------------------------------------

  const CHECKLIST = [
    'Fuel — selector BOTH, quantity checked',
    'Flaps — set, trim set for takeoff',
    'Controls — free and correct',
    'Wind — briefed, gusts on the nose',
    'Runway — 09/27 identified, 720 m',
    'Radio — COM 118.70, callouts on',
  ];

  function drawTitle(state, ui) {
    const shade = context.createLinearGradient(0, 0, FIELD.width * 0.62, 0);
    shade.addColorStop(0, 'rgba(6, 14, 20, 0.82)');
    shade.addColorStop(1, 'rgba(6, 14, 20, 0)');
    context.fillStyle = shade;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    text('INDONESIAN ARCHIPELAGO · CESSNA CLASS', 72, 128, 14, PALETTE.amber, 'left', '700');
    text('ARCHIPELAGO RUN', 70, 196, 56, PALETTE.white, 'left', '700');
    text('Ring courses, a runway 27 final and free flight over seven seeded islands.', 72, 232, 17.5, PALETTE.cream, 'left', '');

    ui.menu.forEach((item, index) => {
      const y = 282 + index * 56;
      if (index === ui.menuIndex) {
        panel(56, y - 34, 520, 48, 0.85);
        context.fillStyle = PALETTE.amber;
        context.fillRect(56, y - 34, 5, 48);
      }
      text(item.label, 84, y, 21, index === ui.menuIndex ? PALETTE.white : PALETTE.cream, 'left', '700');
      if (item.sub) text(item.sub, 560, y, 14.5, PALETTE.muted, 'right', '');
    });

    text('Arrows / WASD fly · W/S throttle · F flaps · C cockpit/chase · X gusts · M sound · P pause', 72, 640, 14, PALETTE.muted, 'left', '');
    text('Enter or click to fly. The cockpit is the home view — C swaps to the chase camera.', 72, 668, 14, PALETTE.muted, 'left', '');

    // The pre-flight checklist card, sim style.
    panel(724, 108, 472, 316, 0.85);
    text('PRE-FLIGHT CHECKLIST', 748, 146, 16, PALETTE.amber, 'left', '700');
    CHECKLIST.forEach((line, index) => {
      const y = 186 + index * 34;
      context.strokeStyle = PALETTE.amber;
      context.lineWidth = 1.6;
      context.strokeRect(748, y - 13, 14, 14);
      context.beginPath();
      context.moveTo(751, y - 6);
      context.lineTo(754.5, y - 2.5);
      context.lineTo(760, y - 10);
      context.stroke();
      text(line, 776, y, 16.5, PALETTE.cream, 'left', '');
    });
    text('Best times and grades are kept for this session.', 748, 392, 13.5, PALETTE.muted, 'left', '');
    if (ui.muted) text('SOUND OFF (M)', 1196, 452, 13, PALETTE.muted, 'right', '700');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(5, 10, 14, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(440, 252, 400, 190, 0.9);
    text('PAUSED', FIELD.width / 2, 316, 34, PALETTE.white, 'center', '700');
    text('P or Esc — resume', FIELD.width / 2, 356, 17, PALETTE.cream, 'center', '');
    text('C — camera view · M — sound', FIELD.width / 2, 384, 17, PALETTE.cream, 'center', '');
    text('Enter — back to title', FIELD.width / 2, 412, 14.5, PALETTE.muted, 'center', '');
  }

  function drawOver(state, ui) {
    context.fillStyle = 'rgba(5, 10, 14, 0.45)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(340, 92, 600, 512, 0.92);
    const headline = state.end === END_COMPLETE ? 'Course complete'
      : state.end === END_LANDED ? 'Down and safe'
        : state.end === END_CRASHED ? 'Crashed' : 'Ditched';
    text(headline, FIELD.width / 2, 158, 38, PALETTE.white, 'center', '700');
    text(state.endReason, FIELD.width / 2, 192, 17, PALETTE.cream, 'center', '');
    text(String(state.score), FIELD.width / 2, 268, 56, PALETTE.amber, 'center', '700');
    text('SCORE', FIELD.width / 2, 292, 12.5, PALETTE.muted, 'center', '700');
    if (state.grade) text(`Grade ${state.grade}`, FIELD.width / 2, 330, 24, PALETTE.white, 'center', '700');
    let y = state.grade ? 372 : 348;
    for (const row of state.breakdown) {
      text(row.label, 396, y, 17.5, PALETTE.cream, 'left', '');
      text(String(row.value), 884, y, 17.5, PALETTE.white, 'right', '700');
      y += 30;
    }
    const bestLine = state.mode === MODE_COURSE && state.course && ui.bests[state.course.id]
      ? `Best time on ${state.course.name}: ${formatClock(ui.bests[state.course.id])}`
      : state.mode === MODE_LANDING && ui.bests.landing
        ? `Best landing score: ${ui.bests.landing}`
        : '';
    if (bestLine) text(bestLine, FIELD.width / 2, 540, 15, PALETTE.muted, 'center', '');
    text('Enter — fly again · Esc — title', FIELD.width / 2, 578, 15.5, PALETTE.cream, 'center', '');
  }

  // --- The frame ---------------------------------------------------------------

  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#06090c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    const palette = dayPalette(state.phase);
    const world = state.world;
    const cam = makeCamera(state, ui.view);
    drawSkyAndSea(cam, palette, state.phase);
    const sorted = [...world.islands].sort((a, b) =>
      Math.hypot(b.x - cam.cx, b.y - cam.cy) - Math.hypot(a.x - cam.cx, a.y - cam.cy));
    for (const island of sorted) drawIsland(cam, world, island, palette);
    drawAirport(cam, world, state, palette);
    drawRings(cam, state);
    drawClouds(cam, world, state, ui.view);

    if (screen === SCREEN_TITLE) {
      drawPlaneChase(cam, state);
      drawTitle(state, ui);
      return;
    }
    if (ui.view === VIEW_COCKPIT) {
      drawCockpitFrame(cam, state);
      drawCockpit(state, ui);
    } else {
      drawPlaneChase(cam, state);
      if (screen !== SCREEN_OVER) drawHudChase(state, ui);
    }
    if (screen === SCREEN_OVER) drawOver(state, ui);
    if (screen === SCREEN_PAUSED) drawPaused();
  }

  resize();
  return { draw, resize };
}
