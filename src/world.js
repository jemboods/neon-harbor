// The city: seeded harbour grid, buildings with lit windows, lamps, piers, water,
// a distant skyline ring, day/night light and rain. Exports collision and road data.
import * as THREE from 'three';
import { BOUND, DISTRICTS, GRID, PITCH, POIS, ROAD_HALF, WATER_Z } from './config.js';
import { createRandom, randInt } from './random.js';

export const CITY_SEED = 4177;

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
/** Facade texture pair: colour map plus an emissive map of only the lit windows. */
function facadeTextures(rng, base) {
  const lit = [];
  const map = canvasTexture(128, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (let y = 10; y < 240; y += 22) for (let x = 10; x < 112; x += 24) {
      const on = rng() < 0.42;
      lit.push(on);
      g.fillStyle = on ? '#ffd98a' : '#101c26';
      g.fillRect(x, y, 14, 12);
    }
  });
  const emissive = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#ffbe5a';
    let i = 0;
    for (let y = 10; y < 240; y += 22) for (let x = 10; x < 112; x += 24) { if (lit[i++]) g.fillRect(x, y, 14, 12); }
  });
  return { map, emissive };
}

export function districtAt(x, z) {
  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return i;
  }
  return 4;
}
const lineDist = (v) => { const m = ((v % PITCH) + PITCH) % PITCH; return Math.min(m, PITCH - m); };
export const onRoad = (x, z) => lineDist(x) < ROAD_HALF || lineDist(z) < ROAD_HALF;
export function roadNodes() {
  const out = [];
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) out.push({ x: i * PITCH, z: j * PITCH });
  return out;
}

const SKY_KEYS = [ // [hour, sky, fog, sun intensity, sun colour]
  [0, 0x060d18, 0x060d18, 0.06, 0x8fb4d8], [5, 0x060d18, 0x060d18, 0.06, 0x8fb4d8],
  [7, 0xd88a52, 0xc7a58a, 0.55, 0xffb37a], [10, 0x9fd4e8, 0xbcd8e2, 1.05, 0xfff2d8],
  [16, 0x8fc8e0, 0xb0ccd6, 0.95, 0xffe9c0], [18.5, 0xe2663a, 0xd89a72, 0.5, 0xff9a52],
  [20, 0x1a2f47, 0x14242f, 0.12, 0x8fb4d8], [24, 0x060d18, 0x060d18, 0.06, 0x8fb4d8],
];
function skyAt(hour) {
  for (let i = 1; i < SKY_KEYS.length; i++) {
    if (hour <= SKY_KEYS[i][0]) {
      const a = SKY_KEYS[i - 1], b = SKY_KEYS[i], f = (hour - a[0]) / (b[0] - a[0]);
      const mix = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), f);
      return { sky: mix(a[1], b[1]), fog: mix(a[2], b[2]), sun: a[3] + (b[3] - a[3]) * f, sunCol: mix(a[4], b[4]) };
    }
  }
  return { sky: new THREE.Color(0x060d18), fog: new THREE.Color(0x060d18), sun: 0.06, sunCol: new THREE.Color(0x8fb4d8) };
}

export function createCity(scene) {
  const rng = createRandom(CITY_SEED);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const ramps = [];
  const box = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parent || group).add(m);
    return m;
  };
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2c3438, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  group.add(ground);
  // Roads: dark strips along every street line, with a dashed centre line texture.
  const roadTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#171c20'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#c8cfd4'; g.fillRect(30, 4, 4, 22);
  }, true);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  const span = (GRID * 2 + 1) * PITCH;
  for (let i = -GRID; i <= GRID; i++) {
    const along = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, span), roadMat);
    along.rotation.x = -Math.PI / 2; along.position.set(i * PITCH, 0, 0);
    group.add(along);
    const across = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_HALF * 2), roadMat);
    across.rotation.x = -Math.PI / 2; across.position.set(0, 0, i * PITCH);
    group.add(across);
  }
  // Water south of the quay plus a far sea ring the skyline stands in.
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a3247, roughness: 0.35, metalness: 0.4, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1000), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.5, WATER_Z + 500);
  group.add(water);
  const quayMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 });
  box(span, 1.2, 10, quayMat, 0, 0.1, WATER_Z - 2);
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  for (const px of [-330, -44, 220]) box(14, 0.8, 90, pierMat, px, 0.1, WATER_Z + 40);
  // Buildings: one to four per block, taller toward Centro and Alto Azul.
  const facades = [0x3a4652, 0x54483c, 0x2f4048, 0x5c5250].map((c) => facadeTextures(rng, '#' + c.toString(16).padStart(6, '0')));
  const winMats = facades.map((f) => new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffc873, emissiveIntensity: 0.25, roughness: 0.9 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 1 });
  for (let bx = -GRID; bx < GRID; bx++) for (let bz = -GRID; bz < GRID; bz++) {
    const cx = bx * PITCH + PITCH / 2, cz = bz * PITCH + PITCH / 2;
    const centreBoost = 1 - Math.min(1, Math.hypot(cx, cz) / 700);
    const n = randInt(rng, 1, 3);
    for (let k = 0; k < n; k++) {
      const w = 18 + rng() * 22, d = 18 + rng() * 22;
      const h = 10 + rng() * 22 + centreBoost * 26 * rng();
      const x = cx + (rng() - 0.5) * (PITCH - ROAD_HALF * 2 - w - 6);
      const z = cz + (rng() - 0.5) * (PITCH - ROAD_HALF * 2 - d - 6);
      if (z + d / 2 > WATER_Z - 8) continue;
      // Named places stay clear: a job point, shop or post must be standable.
      if (POIS.some((p) => Math.abs(p.x - x) < w / 2 + 11 && Math.abs(p.z - z) < d / 2 + 11)) continue;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), winMats[randInt(rng, 0, 3)]);
      b.position.set(x, h / 2, z);
      group.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
      roof.position.set(x, h + 0.25, z);
      group.add(roof);
      colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
    }
  }
  // Street lamps at intersections; one shared head material drives the night glow.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.8 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x554a33, emissive: 0xffb43a, emissiveIntensity: 0.1 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.6, 5);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) {
    if ((i + j) % 2 !== 0) continue;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(i * PITCH + ROAD_HALF + 1, 2.8, j * PITCH + ROAD_HALF + 1);
    group.add(pole);
    const head = new THREE.Mesh(headGeo, lampMat);
    head.position.set(i * PITCH + ROAD_HALF + 1, 5.7, j * PITCH + ROAD_HALF + 1);
    group.add(head);
  }
  // Harbour dressing: crates, EV chargers, scooter racks, ramps.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x74604a, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const x = -440 + rng() * 880, z = 300 + rng() * 130;
    if (onRoad(x, z)) continue;
    if (POIS.some((p) => Math.hypot(p.x - x, p.z - z) < 11)) continue;
    box(2.2, 2.2, 2.2, crateMat, x, 1.1, z);
    colliders.push({ x0: x - 1.1, x1: x + 1.1, z0: z - 1.1, z1: z + 1.1, h: 2.2 });
  }
  const chargerMat = new THREE.MeshStandardMaterial({ color: 0x223140, emissive: 0xeaf6ff, emissiveIntensity: 0.35 });
  for (const p of POIS) box(0.7, 1.3, 0.5, chargerMat, p.x + 4, 0.65, p.z + 3);
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 8; i++) box(3.4, 0.8, 0.5, rackMat, -400 + i * 110, 0.4, 96);
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 1 });
  for (const [rx, rz, rot] of [[-110, 330, 0], [220, -110, Math.PI / 2], [-330, -220, Math.PI]]) {
    const ramp = box(8, 0.4, 6, rampMat, rx, 0.8, rz);
    ramp.rotation.x = rot === 0 ? -0.32 : rot === Math.PI ? 0.32 : 0;
    if (rot === Math.PI / 2) ramp.rotation.z = 0.32;
    ramps.push({ x: rx, z: rz, dir: rot === 0 ? [0, -1] : rot === Math.PI ? [0, 1] : [1, 0] });
  }
  // Distant skyline silhouette ring with lit windows, standing in the sea.
  const skyTex = facadeTextures(rng, '#0a0f16');
  const skyMat = new THREE.MeshStandardMaterial({ map: skyTex.map, emissiveMap: skyTex.emissive, emissive: 0xffc873, emissiveIntensity: 0.5 });
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2 + rng() * 0.1;
    const r = 950 + rng() * 260;
    const h = 60 + rng() * 130, w = 40 + rng() * 50;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    b.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    group.add(b);
  }
  // Rain: a cylinder of falling points that follows the camera target.
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) {
    rainPos[i * 3] = (rng() - 0.5) * 90; rainPos[i * 3 + 1] = rng() * 40; rainPos[i * 3 + 2] = (rng() - 0.5) * 90;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaFC6d8, size: 0.55, transparent: true, opacity: 0.55 }));
  rain.visible = false;
  group.add(rain);
  // Lights.
  const sun = new THREE.DirectionalLight(0xffe9c0, 1);
  sun.position.set(200, 300, 100);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbcd8e8, 0x1c2126, 0.5);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xbcd8e2, 240, 1250);
  let night = 0;
  return {
    colliders, ramps,
    /** Advance sky, lights and water to the given hour; returns 0 day .. 1 night. */
    update(hour, t) {
      const s = skyAt(hour);
      scene.background = s.sky;
      scene.fog.color.copy(s.fog);
      sun.intensity = s.sun;
      sun.color.copy(s.sunCol);
      const elev = Math.sin(((hour - 6) / 12) * Math.PI);
      sun.position.set(Math.cos(((hour - 6) / 12) * Math.PI) * 400, Math.max(24, elev * 420), 160);
      hemi.intensity = 0.14 + Math.max(0, elev) * 0.4;
      night = THREE.MathUtils.clamp(1 - Math.max(0, elev) * 2.4, 0, 1);
      lampMat.emissiveIntensity = 0.1 + night * 1.6;
      for (const m of winMats) m.emissiveIntensity = 0.25 + night * 0.9;
      skyMat.emissiveIntensity = 0.3 + night * 0.5;
      waterMat.color.setHex(0x0a3247).multiplyScalar(1 - night * 0.45);
      return night;
    },
    setRain(on, x, z, dt) {
      rain.visible = on;
      if (!on) return;
      rain.position.set(x, 0, z);
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < 1200; i++) {
        arr[i * 3 + 1] -= 46 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 40;
      }
      rainGeo.attributes.position.needsUpdate = true;
    },
    get night() { return night; },
  };
}

/** Push a point out of every collider it sits in; returns the corrected {x, z}. */
export function collide(colliders, x, z, r) {
  for (const c of colliders) {
    if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) {
      const dxl = x - (c.x0 - r), dxr = (c.x1 + r) - x, dzl = z - (c.z0 - r), dzr = (c.z1 + r) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.x0 - r; else if (m === dxr) x = c.x1 + r;
      else if (m === dzl) z = c.z0 - r; else z = c.z1 + r;
    }
  }
  return { x: THREE.MathUtils.clamp(x, -BOUND, BOUND), z: THREE.MathUtils.clamp(z, -BOUND, Math.max(BOUND, WATER_Z + 84)) };
}
