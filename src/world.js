// The city of Azul: a seeded 9x9-block grid dressed in Three.js — buildings
// with lit windows, lamps, palms, harbour water, street props, pedestrians —
// plus the day/night cycle, seeded rain fronts, collision and the objective
// marker. Everything visual that is not a car or the player lives here.

import * as THREE from 'three';
import { CITY_EDGE, DAY_LENGTH_SECONDS, DISTRICTS, GRID, POIS, STASHES, WATER_Z } from './config.js';

const WORLD_EXTENT = 330; // ground texture covers -330..330 on both axes
const BUILDING_HEIGHTS = { palmas: [6, 14], alto: [20, 52], mercado: [10, 22], centro: [16, 46], harbor: [7, 13], playa: [8, 20] };
const PED_COUNT = 36;
const RAIN_DROPS = 1300;
const FRONT_GAP = [280, 640]; // seconds between rain fronts
const FRONT_SPAN = [55, 130]; // seconds a front lasts

/** Which district a ground position belongs to (matches the painted ground). */
export function districtAt(x, z) {
  const col = x < -56 ? 'w' : x > 56 ? 'e' : 'c';
  if (z < -84) return col === 'w' ? 'palmas' : 'alto';
  if (z > 84) return col === 'e' ? 'playa' : 'harbor';
  return col === 'w' ? 'mercado' : 'centro';
}
export const districtName = (id) => (DISTRICTS.find((d) => d.id === id) ?? DISTRICTS[3]).name;

/** A canvas texture from a draw callback, sized once at build time. */
function canvasTexture(size, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  draw(canvas.getContext('2d'), canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

/** The ground: water colour under everything, then land, district tints, roads. */
function groundTexture() {
  const S = 2048;
  const m = S / (WORLD_EXTENT * 2); // pixels per metre
  const px = (v) => (v + WORLD_EXTENT) * m;
  return canvasTexture([S, S], (g) => {
    g.fillStyle = '#0a3550';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#33383f';
    g.fillRect(px(-272), px(-272), 544 * m, (WATER_Z + 8 + 272) * m);
    // District tints, block by block.
    for (let bx = -GRID.half; bx < GRID.half; bx++) {
      for (let bz = -GRID.half; bz < GRID.half; bz++) {
        const cx = bx * GRID.pitch + GRID.pitch / 2;
        const cz = bz * GRID.pitch + GRID.pitch / 2;
        const tint = DISTRICTS.find((d) => d.id === districtAt(cx, cz)).tint;
        g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
        g.globalAlpha = 0.24;
        g.fillRect(px(cx - GRID.block / 2 - 3), px(cz - GRID.block / 2 - 3), (GRID.block + 6) * m, (GRID.block + 6) * m);
        g.globalAlpha = 1;
      }
    }
    // Sand along the Playa shore.
    g.fillStyle = '#8c7a52';
    g.fillRect(px(60), px(WATER_Z - 16), 212 * m, 20 * m);
    // Roads: dark asphalt along every grid line, with dashed centre lines.
    g.fillStyle = '#1d2026';
    for (let k = -GRID.half; k <= GRID.half; k++) {
      const c = k * GRID.pitch;
      g.fillRect(px(c - GRID.road / 2), px(-272), GRID.road * m, (WATER_Z + 280) * m);
      g.fillRect(px(-272), px(c - GRID.road / 2), 544 * m, GRID.road * m);
    }
    g.fillStyle = '#c8cf3a';
    g.globalAlpha = 0.5;
    for (let k = -GRID.half; k <= GRID.half; k++) {
      const c = k * GRID.pitch;
      for (let d = -268; d < WATER_Z + 4; d += 14) g.fillRect(px(c) - 1, px(d), 2, 7 * m);
      for (let d = -268; d < 268; d += 14) g.fillRect(px(d), px(c) - 1, 7 * m, 2);
    }
    g.globalAlpha = 1;
  });
}

/** Building skin: walls with a window grid; a second canvas lights some windows. */
function facadeTextures() {
  const map = canvasTexture([128, 256], (g, w, h) => {
    g.fillStyle = '#565e6a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2c313a';
    for (let y = 10; y < h - 8; y += 16) for (let x = 8; x < w - 8; x += 14) g.fillRect(x, y, 8, 10);
  });
  const emissive = canvasTexture([128, 256], (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 8; y += 16) {
      for (let x = 8; x < w - 8; x += 14) {
        if ((x * 7 + y * 13) % 5 < 2) {
          g.fillStyle = (x + y) % 3 ? '#ffb45e' : '#7ee8fa';
          g.fillRect(x, y, 8, 10);
        }
      }
    }
  });
  return { map, emissive };
}

export function createWorld(scene, rng) {
  const colliders = []; // {minX, maxX, minZ, maxZ}
  const group = new THREE.Group();
  scene.add(group);

  // ---- ground and water
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_EXTENT * 2, WORLD_EXTENT * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  const waterTex = canvasTexture([256, 256], (g, w, h) => {
    g.fillStyle = '#0d4a6b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#14608a';
    for (let i = 0; i < 260; i++) g.fillRect((i * 37) % w, (i * 53) % h, 22, 3);
  }, true);
  waterTex.repeat.set(10, 3);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(680, 190), new THREE.MeshPhongMaterial({ map: waterTex, transparent: true, opacity: 0.94, shininess: 90 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.12, WATER_Z + 92);
  group.add(water);

  // ---- buildings (one instanced mesh; per-instance colour tints the skin)
  const facades = facadeTextures();
  const buildingMat = new THREE.MeshLambertMaterial({ map: facades.map, emissiveMap: facades.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  const boxes = [];
  for (let bx = -GRID.half; bx < GRID.half; bx++) {
    for (let bz = -GRID.half; bz < GRID.half; bz++) {
      const cx = bx * GRID.pitch + GRID.pitch / 2;
      const cz = bz * GRID.pitch + GRID.pitch / 2;
      const [hMin, hMax] = BUILDING_HEIGHTS[districtAt(cx, cz)];
      const split = rng.chance(0.3);
      const spots = split
        ? [{ dx: -10, dz: 0, w: 17, d: 30 }, { dx: 10, dz: 0, w: 17, d: 30 }]
        : [{ dx: 0, dz: 0, w: rng.range(24, 34), d: rng.range(24, 34) }];
      for (const s of spots) {
        const h = rng.range(hMin, hMax);
        boxes.push({ x: cx + s.dx, z: cz + s.dz, w: s.w, d: s.d, h, tint: new THREE.Color().setHSL(rng.range(0.5, 0.68), rng.range(0.05, 0.22), rng.range(0.5, 0.72)) });
        colliders.push({ minX: cx + s.dx - s.w / 2, maxX: cx + s.dx + s.w / 2, minZ: cz + s.dz - s.d / 2, maxZ: cz + s.dz + s.d / 2, h });
      }
    }
  }
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMat, boxes.length);
  const dummy = new THREE.Object3D();
  boxes.forEach((b, i) => {
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    buildings.setColorAt(i, b.tint);
  });
  group.add(buildings);

  // The Sky Needle: a landmark tower on its POI corner.
  const needle = new THREE.Group();
  const needleMat = new THREE.MeshLambertMaterial({ color: 0x8fa8c8, emissive: 0x1848a8, emissiveIntensity: 0.4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5, 86, 8), needleMat);
  shaft.position.y = 43;
  needle.add(shaft);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b6b }));
  beacon.position.y = 88;
  needle.add(beacon);
  needle.position.set(-28, 0, 40);
  group.add(needle);
  colliders.push({ minX: -33, maxX: -23, minZ: 35, maxZ: 45, h: 88 });

  // ---- lamps: instanced poles; a Points cloud of glows appears at night
  const lampHeads = [];
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x30363f });
  const lampPositions = [];
  for (let k = -GRID.half; k <= GRID.half; k++) {
    for (let d = -4; d <= 4; d++) {
      lampPositions.push([k * GRID.pitch + 8.6, d * GRID.pitch + 20]);
      lampPositions.push([d * GRID.pitch + 20, k * GRID.pitch - 8.6]);
    }
  }
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPositions.length);
  lampPositions.forEach(([x, z], i) => {
    dummy.position.set(x, 2.7, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    lampHeads.push(x, 5.5, z);
  });
  group.add(lamps);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampHeads, 3));
  const glowTex = canvasTexture([64, 64], (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,214,140,1)');
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  const glows = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTex, size: 7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glows.visible = false;
  group.add(glows);

  // ---- palms in the leafy districts
  const palmSpots = [];
  for (let i = 0; i < 52; i++) {
    const x = rng.range(-250, 250);
    const z = rng.range(-250, 250);
    const d = districtAt(x, z);
    if (d !== 'palmas' && d !== 'playa') continue;
    if (Math.abs(((x % GRID.pitch) + GRID.pitch) % GRID.pitch) < 10) continue; // keep off roads
    palmSpots.push([x, z]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 5.6, 5), new THREE.MeshLambertMaterial({ color: 0x7a5c3e }), palmSpots.length);
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.6, 7), new THREE.MeshLambertMaterial({ color: 0x2e9e5b }), palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 2.8, z);
    dummy.rotation.set(rng.range(-0.06, 0.06), 0, rng.range(-0.06, 0.06));
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 6;
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  });
  group.add(trunks, canopies);

  // ---- street props: EV chargers, e-scooter racks, ramps
  const chargerMat = new THREE.MeshLambertMaterial({ color: 0xdfe6ee, emissive: 0x18c8e8, emissiveIntensity: 0.55 });
  const propGroup = new THREE.Group();
  const chargerSpots = [[102, -102], [102, -122], [122, -102], [122, -122]];
  for (let i = 0; i < 8; i++) chargerSpots.push([rng.int(-4, 4) * GRID.pitch + 10, rng.int(-4, 4) * GRID.pitch + 10]);
  for (const [x, z] of chargerSpots) {
    const charger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.25, 0.45), chargerMat);
    charger.position.set(x, 0.62, z);
    propGroup.add(charger);
  }
  const scooterMat = new THREE.MeshLambertMaterial({ color: 0xe83a9f });
  for (let i = 0; i < 9; i++) {
    const x = rng.int(-4, 4) * GRID.pitch - 10;
    const z = rng.int(-4, 4) * GRID.pitch + rng.range(-14, 14);
    const rack = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.6), new THREE.MeshLambertMaterial({ color: 0x3a4656 }));
    rack.position.set(x, 0.25, z);
    propGroup.add(rack);
    for (let s = 0; s < 3; s++) {
      const scooter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 1.1), scooterMat);
      scooter.position.set(x - 1 + s, 0.4, z);
      propGroup.add(scooter);
    }
  }
  group.add(propGroup);

  const ramps = [];
  const rampMat = new THREE.MeshLambertMaterial({ color: 0x8a6d3b });
  for (const [x, z, angle] of [[-56, 120, 0], [112, -56, Math.PI / 2], [0, -168, Math.PI], [168, 168, -Math.PI / 2], [-168, -56, Math.PI / 2], [56, 224, 0]]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 11), rampMat);
    ramp.position.set(x, 0.9, z);
    ramp.rotation.set(-0.21, angle, 0);
    group.add(ramp);
    ramps.push({ x, z, angle, len: 11, h: 2.1 });
  }

  // ---- POI rings and name sprites
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x18c8e8, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (const poi of POIS) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.1, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(poi.x, 0.06, poi.z);
    group.add(ring);
    const label = canvasTexture([256, 48], (g) => {
      g.font = 'bold 25px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#aef3ff';
      g.shadowColor = '#18c8e8';
      g.shadowBlur = 9;
      g.fillText(poi.name.toUpperCase(), 128, 32);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label, transparent: true, depthWrite: false }));
    sprite.scale.set(19, 3.6, 1);
    sprite.position.set(poi.x, 9.5, poi.z);
    group.add(sprite);
  }

  // ---- stash crates
  const stashMeshes = STASHES.map((s) => {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.95, 0.95),
      new THREE.MeshLambertMaterial({ color: 0x0f3a3a, emissive: 0x18e8c8, emissiveIntensity: 0.9 }),
    );
    crate.position.set(s.x, 0.6, s.z);
    group.add(crate);
    return crate;
  });

  // ---- objective marker: a light beam and a ground ring
  const marker = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 2.3, 46, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = 23;
  marker.add(beam);
  const markerRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 26), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = 0.08;
  marker.add(markerRing);
  marker.visible = false;
  group.add(marker);

  // ---- rain
  const rainPos = new Float32Array(RAIN_DROPS * 3);
  for (let i = 0; i < RAIN_DROPS; i++) {
    rainPos[i * 3] = rng.range(-55, 55);
    rainPos[i * 3 + 1] = rng.range(0, 55);
    rainPos[i * 3 + 2] = rng.range(-55, 55);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fc8e8, size: 0.55, transparent: true, opacity: 0, depthWrite: false }));
  rain.visible = false;
  group.add(rain);

  // Rain fronts: seeded schedule, peak intensity and span per front.
  const fronts = [];
  for (let t = rng.range(120, 300), i = 0; i < 14; i++, t += rng.range(FRONT_GAP[0], FRONT_GAP[1])) {
    fronts.push({ start: t, span: rng.range(FRONT_SPAN[0], FRONT_SPAN[1]), peak: rng.range(0.45, 1) });
  }
  function rainAt(time) {
    let level = 0;
    for (const f of fronts) {
      if (time < f.start || time > f.start + f.span) continue;
      const u = (time - f.start) / f.span;
      level = Math.max(level, f.peak * Math.sin(u * Math.PI));
    }
    return level;
  }

  // ---- pedestrians
  const peds = [];
  const pedBodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < PED_COUNT; i++) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.26), pedBodyMat.clone());
    body.material.color.setHSL(rng.next(), 0.45, rng.range(0.35, 0.65));
    body.position.y = 0.95;
    mesh.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshLambertMaterial({ color: 0xd9a37e }));
    head.position.y = 1.52;
    mesh.add(head);
    const bx = rng.int(-4, 3) * GRID.pitch + GRID.pitch / 2;
    const bz = rng.int(-4, 3) * GRID.pitch + GRID.pitch / 2;
    const ped = { mesh, x: bx + rng.range(-22, 22), z: bz + rng.range(-22, 22), tx: 0, tz: 0, speed: rng.range(1.1, 1.7), flee: 0, wait: 0 };
    ped.tx = ped.x;
    ped.tz = ped.z;
    mesh.position.set(ped.x, 0, ped.z);
    group.add(mesh);
    peds.push(ped);
  }
  let panic = null; // {x, z, r, t}

  // ---- cycle state
  let time = 0;
  let cycle = 0.18; // just after dawn
  const skyDay = new THREE.Color(0x87b5d9);
  const skyNight = new THREE.Color(0x060a16);
  const skyDusk = new THREE.Color(0xd97a4a);
  const skyNow = new THREE.Color();

  const world = {
    colliders,
    ramps,
    stashMeshes,
    time: () => time,
    cycle: () => cycle,
    /** Jump the day cycle (screenshot staging and debug). */
    setCycle(value) {
      cycle = ((value % 1) + 1) % 1;
    },
    rain: () => rainAt(time),
    isNight: () => Math.sin(cycle * Math.PI * 2) < 0.1,
    clockText() {
      const hours = (6 + cycle * 24) % 24;
      const hh = Math.floor(hours);
      const mm = Math.floor((hours - hh) * 60);
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    },
    poi: (id) => POIS.find((p) => p.id === id),
    setMarker(x, z, color) {
      marker.visible = true;
      marker.position.set(x, 0, z);
      if (color) {
        beam.material.color.setHex(color);
        markerRing.material.color.setHex(color);
      }
    },
    clearMarker() {
      marker.visible = false;
    },
    setPanic(x, z, r) {
      panic = { x, z, r, t: 2.2 };
    },
    /** Height of the ground at a point: ramps are the only raised drives. */
    groundHeight(x, z) {
      for (const ramp of ramps) {
        const dx = x - ramp.x;
        const dz = z - ramp.z;
        const along = dx * Math.sin(ramp.angle) + dz * Math.cos(ramp.angle);
        const across = dx * Math.cos(ramp.angle) - dz * Math.sin(ramp.angle);
        if (Math.abs(across) < 2.6 && Math.abs(along) < ramp.len / 2) {
          return ramp.h * (along / ramp.len + 0.5);
        }
      }
      return 0;
    },
    /** Push a circle at (x, z) out of every building and back inside the city. */
    collide(x, z, r) {
      for (const c of colliders) {
        const nx = Math.max(c.minX, Math.min(x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - nx;
        const dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Centre inside the box: leave by the nearest face.
          const left = x - c.minX;
          const right = c.maxX - x;
          const top = z - c.minZ;
          const bottom = c.maxZ - z;
          const min = Math.min(left, right, top, bottom);
          if (min === left) x = c.minX - r;
          else if (min === right) x = c.maxX + r;
          else if (min === top) z = c.minZ - r;
          else z = c.maxZ + r;
        }
      }
      x = Math.max(-CITY_EDGE - 14, Math.min(CITY_EDGE + 14, x));
      z = Math.max(-CITY_EDGE - 14, Math.min(WATER_Z - 2, z));
      return { x, z };
    },
    /** Advance the cycle, weather, water, marker, stashes and pedestrians. */
    update(dt, focus, env) {
      time += dt;
      cycle = (cycle + dt / DAY_LENGTH_SECONDS) % 1;
      const sunAngle = cycle * Math.PI * 2;
      const elev = Math.sin(sunAngle); // >0 by day
      const dayMix = THREE.MathUtils.clamp((elev + 0.25) / 0.7, 0, 1);
      skyNow.copy(skyNight).lerp(skyDay, dayMix);
      if (elev > -0.05 && elev < 0.3) skyNow.lerp(skyDusk, (0.3 - Math.abs(elev)) * 1.4);
      env.scene.background.copy(skyNow);
      env.scene.fog.color.copy(skyNow);
      env.sun.position.set(Math.cos(sunAngle) * 190, Math.max(14, elev * 220), 70);
      env.sun.intensity = 0.12 + dayMix * 1.5;
      env.hemi.intensity = 0.22 + dayMix * 0.75;
      env.ambient.intensity = 0.3 + dayMix * 0.18;
      buildingMat.emissiveIntensity = (1 - dayMix) * 0.95;
      glows.visible = dayMix < 0.45;
      beacon.material.color.setHex(Math.floor(time * 2) % 2 ? 0xff3b6b : 0x5a1024);
      waterTex.offset.x = (time * 0.008) % 1;
      waterTex.offset.y = (time * 0.003) % 1;
      marker.children[0].material.opacity = 0.26 + Math.sin(time * 4) * 0.09;
      for (const crate of stashMeshes) {
        if (!crate.visible) continue;
        crate.rotation.y += dt * 1.4;
        crate.position.y = 0.6 + Math.sin(time * 2.4 + crate.position.x) * 0.14;
      }
      // Rain: recycle drops inside a box that follows the focus.
      const rainLevel = rainAt(time);
      rain.visible = rainLevel > 0.03;
      if (rain.visible) {
        rain.material.opacity = rainLevel * 0.75;
        rain.position.set(focus.x, 0, focus.z);
        const pos = rainGeo.attributes.position.array;
        for (let i = 0; i < RAIN_DROPS; i++) {
          pos[i * 3 + 1] -= dt * 34;
          if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] += 55;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      if (panic) {
        panic.t -= dt;
        if (panic.t <= 0) panic = null;
      }
      // Pedestrians: stroll the block edges, flee panic, shelter from rain.
      for (const ped of peds) {
        const dx = ped.tx - ped.x;
        const dz = ped.tz - ped.z;
        const dist = Math.hypot(dx, dz);
        let speed = ped.speed;
        if (panic && Math.hypot(ped.x - panic.x, ped.z - panic.z) < panic.r) {
          ped.tx = ped.x + (ped.x - panic.x) * 2;
          ped.tz = ped.z + (ped.z - panic.z) * 2;
          speed = 3.6;
        } else if (rainLevel > 0.5) {
          speed = 0; // sheltering under an awning: stand still
        }
        if (dist < 1.2) {
          const corner = rng.int(0, 3);
          const bx = Math.round((ped.x - GRID.pitch / 2) / GRID.pitch) * GRID.pitch + GRID.pitch / 2;
          const bz = Math.round((ped.z - GRID.pitch / 2) / GRID.pitch) * GRID.pitch + GRID.pitch / 2;
          ped.tx = bx + (corner % 2 ? 23 : -23);
          ped.tz = bz + (corner < 2 ? 23 : -23);
        } else if (speed > 0) {
          ped.x += (dx / dist) * speed * dt;
          ped.z += (dz / dist) * speed * dt;
          ped.mesh.rotation.y = Math.atan2(dx, dz);
        }
        ped.mesh.position.set(ped.x, 0, ped.z);
      }
      return { rainLevel, dayMix };
    },
  };
  return world;
}
