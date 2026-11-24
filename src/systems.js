// Gameplay systems: traffic, pedestrians, police (Fix 1), story missions (Fix 2),
// gigs, contracts, races, bounties, crew, stashes, weather, properties and mods.
import * as THREE from 'three';
import {
  BOUNTIES, BUST_DRAIN, BUST_FILL, BUST_PIN_SPEED, BUST_RANGE, CONTRACTS, COPS_BY_STAR,
  COP_DESPAWN_DIST, COP_SPAWN_MIN, COP_UNSEEN_DESPAWN, DISTRICTS, HEAT_DECAY, HEAT_UNSEEN,
  INTERCEPTOR, JOB_LINES, PITCH, POIS, PROPERTIES, RACES, STAR_HEAT, STASH_COUNT, STASH_SEED,
  STORY, STORY_PAYOUTS, VEHICLES,
} from './config.js';
import { createRandom, pick, randInt } from './random.js';
import { buildCar } from './cars.js';
import { buildHumanoid, pose } from './people.js';
import { CHARACTERS, PED_SHIRTS } from './config.js';
import { collide, districtAt, roadNodes } from './world.js';
import { paySide, payStory } from './state.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function createSystems(scene, city, hud, audio) {
  const rng = createRandom(20240);
  const nodes = roadNodes();
  const cars = [];
  const peds = [];
  const events = [];
  const messages = [{ from: 'Marisol', text: 'You owe the harbor $100,000. Come to the cantina and work it off.' }];
  let time = 0;

  function spawnCar(model, color, x, z, heading, role) {
    const view = buildCar(model, color, role === 'cop');
    view.group.position.set(x, 0, z);
    scene.add(view.group);
    const car = {
      model, color, view, x, z, heading, speed: 0, hp: 100, role, born: time,
      tx: x, tz: z, cruise: 11 + rng() * 5, waitT: 0, officer: null, pinT: 0,
      mods: { paint: 0, neon: false, grip: 0, turbo: 0, armor: 0 }, yours: false, dead: false,
    };
    cars.push(car);
    return car;
  }
  function removeCar(car) {
    scene.remove(car.view.group);
    if (car.officer) scene.remove(car.officer.group);
    cars.splice(cars.indexOf(car), 1);
  }
  /** Drive a car toward a point; returns distance actually moved. */
  function steer(car, dt, tx, tz, topSpeed, turnRate = 1.9) {
    // Unstick: if a wall has held the car, break for the nearest road node
    // first — the response drives the streets, not through the blocks.
    if (car.wpT > 0) {
      car.wpT -= dt;
      tx = car.wpX; tz = car.wpZ;
      if (Math.hypot(tx - car.x, tz - car.z) < 7) car.wpT = 0;
    }
    const dx = tx - car.x, dz = tz - car.z;
    const want = Math.atan2(dx, dz);
    const diff = angDiff(car.heading, want);
    const gripF = 1 + car.mods.grip * 0.08;
    car.heading += THREE.MathUtils.clamp(diff, -turnRate * gripF * dt, turnRate * gripF * dt);
    const aligned = Math.max(0, 1 - Math.abs(diff) * 0.55);
    const target = topSpeed * aligned;
    const accel = VEHICLES[car.model].accel * (1 + car.mods.turbo * 0.12);
    car.speed += THREE.MathUtils.clamp(target - car.speed, -26 * dt, accel * dt);
    const wet = weather.raining ? 0.82 : 1;
    const step = car.speed * wet * dt;
    car.x += Math.sin(car.heading) * step;
    car.z += Math.cos(car.heading) * step;
    const fixed = collide(city.colliders, car.x, car.z, 1.7);
    car.x = fixed.x; car.z = fixed.z;
    car.view.group.position.set(car.x, 0, car.z);
    car.view.group.rotation.y = car.heading - Math.PI / 2;
    car.view.update(Math.abs(step), time, car.role === 'cop');
    if (topSpeed > 3 && car.wpT <= 0) {
      if (Math.abs(step) < 0.3 * topSpeed * dt) car.blockT = (car.blockT || 0) + dt;
      else car.blockT = 0;
      if (car.blockT > 0.6) {
        const n = pickNodeNear(car.x, car.z, 25, 90);
        if (n) { car.wpX = n.x; car.wpZ = n.z; car.wpT = 4; }
        car.blockT = 0;
      }
    }
    return Math.abs(step);
  }
  function pickNodeNear(x, z, minD, maxD) {
    let best = null;
    for (let tries = 0; tries < 24; tries++) {
      const n = pick(rng, nodes);
      const d = Math.hypot(n.x - x, n.z - z);
      if (d >= minD && d <= maxD) { best = n; break; }
    }
    return best;
  }
  // --- pedestrians: wander between sidewalk waypoints, shelter in rain ---
  function spawnPed(x, z, spec) {
    const h = buildHumanoid(spec);
    h.group.position.set(x, 0, z);
    scene.add(h.group);
    const ped = { h, x, z, heading: rng() * 6.28, tx: x, tz: z, phase: rng() * 6, speed: 1.5 + rng() * 0.5, role: 'walker', spec };
    peds.push(ped);
    return ped;
  }
  for (let i = 0; i < 14; i++) {
    const n = pick(rng, nodes);
    const spec = { ...CHARACTERS.homie, shirt: pick(rng, PED_SHIRTS), hatColor: pick(rng, PED_SHIRTS) };
    spawnPed(n.x + 16, n.z + 16, spec);
  }
  function updatePeds(dt, P) {
    for (const ped of peds) {
      if (ped.role === 'officer') continue; // officers are driven by their cruiser
      const d = Math.hypot(ped.tx - ped.x, ped.tz - ped.z);
      const shelter = weather.raining;
      if (d < 2 || (shelter && ped.role === 'walker')) {
        if (!shelter && rng() < 0.01) {
          const n = pickNodeNear(ped.x, ped.z, 30, 130) || { x: ped.x, z: ped.z };
          ped.tx = n.x + 16 + rng() * 6; ped.tz = n.z + 16 + rng() * 6;
        }
        pose(ped.h, 0, false, time + ped.phase);
        continue;
      }
      ped.heading = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.phase += dt * 5.2;
      ped.h.group.position.set(ped.x, 0, ped.z);
      ped.h.group.rotation.y = ped.heading;
      pose(ped.h, ped.phase, true, time);
      if (Math.hypot(ped.x - P.x, ped.z - P.z) > 420) { // recycle far walkers near the player
        const n = pickNodeNear(P.x, P.z, 60, 160);
        if (n) { ped.x = n.x + 16; ped.z = n.z + 16; ped.tx = ped.x; ped.tz = ped.z; }
      }
    }
  }
  // --- traffic and parked cars ---
  for (let i = 0; i < 10; i++) {
    const poi = POIS[i];
    const c = spawnCar(randInt(rng, 0, 7), pick(rng, VEHICLES[randInt(rng, 0, 7)].colors), poi.x + 7, poi.z + 5, rng() * 6.28, 'parked');
    c.cruise = 0;
  }
  function updateTraffic(dt, P) {
    let live = 0;
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      if (car.role !== 'traffic') continue;
      live++;
      const d = dist(car, P);
      if (d > 520) { removeCar(car); continue; }
      if (Math.hypot(car.tx - car.x, car.tz - car.z) < 9) {
        const n = pickNodeNear(car.x, car.z, 90, 130) || pick(rng, nodes);
        // right-hand lane: aim beside the node, on the car's right
        car.tx = n.x - Math.cos(car.heading) * 4.2;
        car.tz = n.z + Math.sin(car.heading) * 4.2;
      }
      steer(car, dt, car.tx, car.tz, car.cruise * (weather.raining ? 0.8 : 1));
    }
    if (live < 15) {
      const n = pickNodeNear(P.x, P.z, 150, 420);
      if (n) {
        const model = randInt(rng, 0, 7);
        spawnCar(model, pick(rng, VEHICLES[model].colors), n.x, n.z, rng() * 6.28, 'traffic');
      }
    }
  }
  /** Simple circle collisions between cars; hard hits damage and can pin. */
  function carCollisions(dt, P, playerCar) {
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 4.4 || d === 0) continue;
      const push = (4.4 - d) / 2, nx = dx / d, nz = dz / d;
      if (a !== playerCar) { a.x -= nx * push; a.z -= nz * push; }
      if (b !== playerCar) { b.x += nx * push; b.z += nz * push; }
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 7) {
        const dmg = (rel - 6) * 2.2;
        damageCar(a, dmg * 0.5); damageCar(b, dmg * 0.5);
        if (a === playerCar || b === playerCar) events.push({ k: 'crash', power: rel });
      }
      a.speed *= 0.55; b.speed *= 0.55;
    }
  }
  function damageCar(car, dmg) {
    if (car.dead) return;
    car.hp -= dmg * (1 - car.mods.armor * 0.18);
    if (car.hp <= 0) {
      car.dead = true; car.speed = 0;
      if (car.role === 'bounty') collectBounty(car);
      else if (car.role === 'traffic' || car.role === 'parked') hud.toast('Wrecked — that leaves a mark');
    }
  }
  // --- weather: seeded rain fronts ---
  const weather = { raining: false, timer: 130 };
  function updateWeather(dt) {
    weather.timer -= dt;
    if (weather.timer <= 0) {
      weather.raining = !weather.raining;
      weather.timer = weather.raining ? 55 + rng() * 40 : 140 + rng() * 120;
      if (weather.raining) hud.toast('Rain front coming in — the streets are wet');
    }
  }
  // --- stashes ---
  const stashRng = createRandom(STASH_SEED);
  const stashMeshes = [];
  {
    const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const m = new THREE.MeshStandardMaterial({ color: 0x8a5f14, emissive: 0xffb43a, emissiveIntensity: 1.4 });
    for (let i = 0; i < STASH_COUNT; i++) {
      const n = nodes[randInt(stashRng, 0, nodes.length - 1)];
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(n.x + (stashRng() - 0.5) * 26, 0.8, Math.min(430, n.z + (stashRng() - 0.5) * 26));
      scene.add(mesh);
      stashMeshes.push({ mesh, id: i, taken: false });
    }
  }
  // --- police (Fix 1) ---
  const police = { spawnT: 0, blocks: [], blockCd: 0, heli: null, heliView: null, cold: false };
  const nodeAt = new Map(nodes.map((n) => [Math.round(n.x / PITCH) + ',' + Math.round(n.z / PITCH), n]));
  function nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  /** A* over the intersection grid: the route a car can actually drive. */
  function roadPath(x0, z0, x1, z1) {
    const start = nearestNode(x0, z0), goal = nearestNode(x1, z1);
    if (!start || !goal) return [{ x: x1, z: z1 }];
    const gi = (n) => Math.round(n.x / PITCH), gj = (n) => Math.round(n.z / PITCH);
    const open = [{ n: start, g: 0, f: 0, from: null }];
    const seenG = new Map([[start, 0]]);
    let end = null;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.n === goal) { end = cur; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nn = nodeAt.get((gi(cur.n) + di) + ',' + (gj(cur.n) + dj));
        if (!nn) continue;
        const g = cur.g + 1;
        if (seenG.has(nn) && seenG.get(nn) <= g) continue;
        seenG.set(nn, g);
        open.push({ n: nn, g, f: g + Math.abs(gi(nn) - gi(goal)) + Math.abs(gj(nn) - gj(goal)), from: cur });
      }
    }
    if (!end) return [{ x: x1, z: z1 }];
    const pts = [];
    for (let c = end; c; c = c.from) pts.unshift({ x: c.n.x, z: c.n.z });
    pts.push({ x: x1, z: z1 });
    return pts;
  }
  function spawnCop(P) {
    const n = pickNodeNear(P.x, P.z, COP_SPAWN_MIN, 430);
    if (!n) return;
    spawnCar(INTERCEPTOR, 0x1f3b73, n.x, n.z, Math.atan2(P.x - n.x, P.z - n.z), 'cop');
  }
  function standDown(S) {
    S.heat = 0; S.stars = 0; S.bust = 0; S.bustWarned = false;
    police.cold = false;
    for (let i = cars.length - 1; i >= 0; i--) if (cars[i].role === 'cop') removeCar(cars[i]);
    for (const b of police.blocks) scene.remove(b.view);
    police.blocks = [];
    if (police.heliView) { scene.remove(police.heliView); police.heliView = null; police.heli = null; }
  }
  function addHeat(S, n) {
    S.heat = Math.min(170, S.heat + n);
    S.stars = STAR_HEAT.filter((t) => S.heat >= t).length;
    police.cold = false; // fresh heat means a fresh hunt
  }
  function updatePolice(dt, S, P) {
    const cops = cars.filter((c) => c.role === 'cop');
    // Seeing: any unit close enough refreshes the hunt.
    let seen = false, nearest = 1e9;
    for (const cop of cops) {
      const d = dist(cop, P);
      nearest = Math.min(nearest, d);
      if (d < 130) seen = true;
      if (cop.officer && Math.hypot(cop.officer.x - P.x, cop.officer.z - P.z) < 60) seen = true;
    }
    if (police.heli && Math.hypot(police.heli.x - P.x, police.heli.z - P.z) < 170) seen = true;
    if (seen) { S.unseenFor = 0; S.lastSeen = { x: P.x, z: P.z }; police.cold = false; }
    else S.unseenFor += dt;
    // Amended heat rule: decay only when long unseen AND no cruiser is tasked.
    if (S.unseenFor > HEAT_UNSEEN && cops.length === 0 && S.heat > 0) {
      S.heat = Math.max(0, S.heat - HEAT_DECAY * dt);
      S.stars = STAR_HEAT.filter((t) => S.heat >= t).length;
    }
    // Spawn the star-scaled response, always far away (Fix 1). Once the trail
    // is cold (a unit gave up far away, unseen) no fresh units are dispatched:
    // losing the hunt is what lets heat decay at all.
    police.spawnT -= dt;
    if (!police.cold && cops.length < COPS_BY_STAR[S.stars] && police.spawnT <= 0) { spawnCop(P); police.spawnT = 1.4; }
    // Despawn only when far, long unseen, and no longer closing (Fix 1): a unit
    // still driving its approach is never pulled, however old the hunt is.
    for (const cop of [...cops]) {
      const dNow = dist(cop, P);
      if (cop.minD === undefined || dNow < cop.minD - 2) { cop.minD = dNow; cop.bestT = time; }
      if (dNow > COP_DESPAWN_DIST && S.unseenFor > COP_UNSEEN_DESPAWN && time - (cop.bestT ?? 0) > COP_UNSEEN_DESPAWN) { removeCar(cop); police.cold = true; }
    }
    // Pursuit: drive the roads to the player or the last seen point.
    for (const cop of cars.filter((c) => c.role === 'cop')) {
      const target = S.unseenFor < 3 ? P : (S.lastSeen || P);
      const d = dist(cop, P);
      const top = VEHICLES[INTERCEPTOR].speed * (0.8 + S.stars * 0.045) * (d > 130 ? 1.12 : 1);
      if (P.onFoot && d < 26) {
        steer(cop, dt, cop.x, cop.z, 0); // park up and send the officer out
        if (!cop.officer) {
          const h = buildHumanoid(CHARACTERS.officer);
          h.group.position.set(cop.x + 2, 0, cop.z);
          scene.add(h.group);
          cop.officer = { h, x: cop.x + 2, z: cop.z, phase: 0, car: cop, role: 'officer', tx: cop.x + 2, tz: cop.z, speed: 3.1, spec: CHARACTERS.officer };
          peds.push(cop.officer);
        }
      } else {
        if (cop.officer && d > 34) { // back in the car
          scene.remove(cop.officer.h.group);
          peds.splice(peds.indexOf(cop.officer), 1);
          cop.officer = null;
        }
        // Follow the streets: an A* route over the intersection grid.
        cop.pathT = (cop.pathT || 0) - dt;
        const endMoved = !cop.pathEnd || Math.hypot(cop.pathEnd.x - target.x, cop.pathEnd.z - target.z) > 45;
        if (!cop.path || endMoved || cop.pathT <= 0) {
          cop.path = roadPath(cop.x, cop.z, target.x, target.z);
          cop.pathI = 0; cop.pathEnd = { x: target.x, z: target.z }; cop.pathT = 2.5;
        }
        let wp = cop.path[Math.min(cop.pathI, cop.path.length - 1)];
        if (cop.pathI < cop.path.length - 1 && Math.hypot(wp.x - cop.x, wp.z - cop.z) < 10) { cop.pathI++; wp = cop.path[cop.pathI]; }
        steer(cop, dt, wp.x, wp.z, top);
      }
      if (cop.officer) {
        const o = cop.officer;
        o.role = 'officer';
        const od = Math.hypot(P.x - o.x, P.z - o.z);
        if (od > 1.6) {
          const h = Math.atan2(P.x - o.x, P.z - o.z);
          o.x += Math.sin(h) * 3.1 * dt; o.z += Math.cos(h) * 3.1 * dt;
          o.phase += dt * 6;
          o.h.group.position.set(o.x, 0, o.z); o.h.group.rotation.y = h;
          pose(o.h, o.phase, true, time);
        } else pose(o.h, 0, false, time);
      }
    }
    // Roadblocks and spikes at 4 stars.
    police.blockCd -= dt;
    if (S.stars >= 4 && police.blocks.length === 0 && police.blockCd <= 0) {
      const bx = P.x + Math.sin(P.heading) * 190, bz = P.z + Math.cos(P.heading) * 190;
      const n = pickNodeNear(bx, bz, 0, 90);
      if (n) {
        const view = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x30363e, emissive: 0xe5484d, emissiveIntensity: 0.5 }));
        view.position.set(n.x, 0.1, n.z);
        scene.add(view);
        police.blocks.push({ view, x: n.x, z: n.z });
        const b1 = spawnCar(INTERCEPTOR, 0x1f3b73, n.x - 6, n.z, 1.2, 'parked');
        const b2 = spawnCar(INTERCEPTOR, 0x1f3b73, n.x + 6, n.z, -1.2, 'parked');
        b1.role = 'block'; b2.role = 'block';
        hud.subtitle('Dispatch', 'Roadblock ahead. Spike strip on the road.');
      }
    }
    for (const b of [...police.blocks]) {
      if (P.car && Math.hypot(b.x - P.x, b.z - P.z) < 5 && Math.abs(P.car.speed) > 6) events.push({ k: 'spiked' });
      if (Math.hypot(b.x - P.x, b.z - P.z) > 340) {
        scene.remove(b.view);
        police.blocks.splice(police.blocks.indexOf(b), 1);
        police.blockCd = 20;
      }
    }
    // Searchlight helicopter at 5 stars; loses the player when unseen builds.
    if (S.stars >= 5 && !police.heli) {
      const g = new THREE.Group();
      const bodyM = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6.4), new THREE.MeshStandardMaterial({ color: 0x1c2733 }));
      g.add(bodyM);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x0c0f12 }));
      rotor.position.y = 1; g.add(rotor);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 42, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, depthWrite: false }));
      cone.position.y = -21; g.add(cone);
      g.position.set(P.x + 60, 44, P.z + 60);
      scene.add(g);
      police.heli = { x: P.x + 60, z: P.z + 60, view: g, rotor, gone: false };
      police.heliView = g;
    }
    if (police.heli) {
      const h = police.heli;
      if (S.unseenFor > 6) h.gone = true;
      const tx = h.gone ? P.x + 500 : (S.lastSeen ? S.lastSeen.x : P.x);
      const tz = h.gone ? P.z - 500 : (S.lastSeen ? S.lastSeen.z : P.z);
      h.x += (tx - h.x) * Math.min(1, dt * 0.7);
      h.z += (tz - h.z) * Math.min(1, dt * 0.7);
      h.view.position.set(h.x, 44 + Math.sin(time * 0.8) * 1.5, h.z);
      h.rotor.rotation.y += dt * 28;
      if (h.gone && Math.hypot(h.x - P.x, h.z - P.z) > 480) {
        scene.remove(h.view); police.heli = null; police.heliView = null;
      }
    }
    // Bust meter (Fix 1): fills only while pinned by a unit within range.
    let pinDist = 1e9;
    for (const cop of cars.filter((c) => c.role === 'cop')) {
      pinDist = Math.min(pinDist, dist(cop, P));
      if (cop.officer) pinDist = Math.min(pinDist, Math.hypot(cop.officer.x - P.x, cop.officer.z - P.z));
    }
    const pinned = pinDist < BUST_RANGE && P.speed < BUST_PIN_SPEED;
    if (pinned) {
      S.bust = Math.min(100, S.bust + BUST_FILL * dt);
      if (S.bust > 50 && !S.bustWarned) {
        S.bustWarned = true;
        hud.subtitle('', 'Break away, or you are busted.');
      }
    } else {
      S.bust = Math.max(0, S.bust - BUST_DRAIN * dt);
      if (S.bust < 40) S.bustWarned = false;
    }
    if (S.bust >= 100) { events.push({ k: 'busted' }); S.bust = 0; }
    return nearest;
  }
  // --- story missions (Fix 2) ---
  const mission = { active: null, offerAt: null };
  function jobStartPoi(jobIdx) {
    const j = STORY[jobIdx];
    return j[3] === 'r' ? POIS[3] : POIS[j[4]];
  }
  function buildSteps(jobIdx) {
    const [title, , giver, kind, from, to] = STORY[jobIdx];
    const steps = [];
    if (kind !== 'r') steps.push({ kind: 'pickup', x: POIS[from].x, z: POIS[from].z, place: POIS[from].name, speaker: giver });
    steps.push({ kind: 'drop', x: POIS[to].x, z: POIS[to].z, place: POIS[to].name, speaker: giver });
    if (kind === 'e') steps.push({ kind: 'escape', x: POIS[to].x, z: POIS[to].z, place: 'anywhere quiet', speaker: giver });
    return steps;
  }
  function currentStep() {
    return mission.active ? mission.active.steps[mission.active.i] : null;
  }
  function announceStep() {
    const st = currentStep();
    if (!st) return;
    const lines = {
      pickup: `Pick up at ${st.place}. The clock is not your friend.`,
      drop: `Take them to ${st.place}. Do not scratch the paint.`,
      escape: 'Heat is on you. Break sight and let it cool.',
    };
    hud.subtitle(st.speaker, lines[st.kind]);
  }
  function acceptJob(S) {
    const idx = S.jobIndex;
    mission.active = { idx, steps: buildSteps(idx), i: 0 };
    mission.offerAt = null;
    hud.jobCard(null);
    const chapterIdx = Math.floor(idx / 5);
    if (idx % 5 === 0) events.push({ k: 'chapter', idx: chapterIdx });
    announceStep();
    audio.text();
  }
  function failJob(S, reason) {
    if (!mission.active) return;
    mission.active = null;
    hud.subtitle('Marisol', `${reason} Drive back to ${jobStartPoi(S.jobIndex).name} to retry.`);
  }
  function updateMission(dt, S, P) {
    if (S.jobIndex >= STORY.length) { mission.offerAt = null; return; }
    if (!mission.active) {
      const at = jobStartPoi(S.jobIndex);
      mission.offerAt = Math.hypot(at.x - P.x, at.z - P.z) < 9 ? at : null;
      return;
    }
    const st = currentStep();
    if (st.kind === 'escape') {
      if (S.stars === 0) finishJob(S);
      return;
    }
    const need = st.kind === 'pickup' ? 6 : 10;
    if (Math.hypot(st.x - P.x, st.z - P.z) < need) {
      mission.active.i++;
      if (mission.active.i >= mission.active.steps.length) finishJob(S);
      else {
        if (st.kind === 'pickup') hud.subtitle(st.speaker, 'In. Go, go.');
        announceStep();
      }
    }
  }
  function finishJob(S) {
    const idx = mission.active.idx;
    const pay = STORY_PAYOUTS[idx];
    mission.active = null;
    payStory(S, pay);
    S.jobsDone++;
    S.jobIndex++;
    addStanding(S, districtAt(P_last.x, P_last.z), 22);
    events.push({ k: 'passed', pay, title: STORY[idx][0] });
    if (S.jobIndex < STORY.length) {
      messages.push({ from: 'Marisol', text: `Next job is open: ${STORY[S.jobIndex][0]}. ${STORY[S.jobIndex][1]}` });
    } else {
      messages.push({ from: 'Marisol', text: 'The ledger is closed. The harbor is yours now.' });
    }
  }
  let P_last = { x: 0, z: 0 };
  // --- gigs, contracts, races, bounties, crew ---
  const gig = { active: null, offer: null, offerT: 20 };
  function updateGig(dt, S, P) {
    gig.offerT -= dt;
    if (!gig.active && !gig.offer && gig.offerT <= 0 && !mission.active) {
      const a = pick(rng, POIS), b = pick(rng, POIS);
      if (a !== b) gig.offer = { kind: rng() < 0.5 ? 'taxi' : 'courier', x: a.x, z: a.z, tx: b.x, tz: b.z, place: a.name, dest: b.name, pay: 180 + randInt(rng, 0, 160) };
    }
    if (gig.offer && Math.hypot(gig.offer.x - P.x, gig.offer.z - P.z) > 60) { gig.offer = null; gig.offerT = 25; }
    if (!gig.active) return;
    const g = gig.active;
    g.timer -= dt;
    if (g.timer <= 0) { gig.active = null; hud.subtitle('Dispatch', 'Too slow — the fare walked. Watch for the next gig.'); return; }
    const target = g.phase === 0 ? g : { x: g.tx, z: g.tz };
    if (Math.hypot(target.x - P.x, target.z - P.z) < 10) {
      if (g.phase === 0) { g.phase = 1; hud.subtitle('Passenger', 'Thanks. Take me across, quick and clean.'); }
      else {
        paySide(S, g.pay); addStanding(S, districtAt(P.x, P.z), 8);
        events.push({ k: 'cash', amount: g.pay, label: 'Gig paid' });
        gig.active = null; gig.offerT = 30;
      }
    }
  }
  const contract = { active: null, next: 0 };
  function acceptContract(S) {
    if (contract.active) return false;
    const idx = contract.next++ % CONTRACTS.length;
    const [client, from, to, secs, cap, pay] = CONTRACTS[idx];
    contract.active = { idx, client, phase: 0, x: POIS[from].x, z: POIS[from].z, tx: POIS[to].x, tz: POIS[to].z, dest: POIS[to].name, timer: secs, cap, pay };
    hud.subtitle(client, `Pick me up and get me to ${POIS[to].name}. Keep it under ${cap} star${cap > 1 ? 's' : ''}.`);
    return true;
  }
  function updateContract(dt, S, P) {
    const c = contract.active;
    if (!c) return;
    c.timer -= dt;
    if (S.stars > c.cap && !c.warned) { c.warned = true; hud.subtitle(c.client, 'Too much heat — lose them or this deal dies.'); }
    if (c.timer <= 0) { contract.active = null; hud.subtitle(c.client, 'You are late. The deal is off.'); return; }
    const target = c.phase === 0 ? c : { x: c.tx, z: c.tz };
    if (Math.hypot(target.x - P.x, target.z - P.z) < 10) {
      if (c.phase === 0) { c.phase = 1; hud.subtitle(c.client, `Go — ${c.dest}, and keep it clean.`); }
      else {
        const bonus = c.timer > CONTRACTS[c.idx][3] * 0.3 ? Math.round(c.pay * 0.25) : 0;
        paySide(S, c.pay + bonus); addStanding(S, districtAt(P.x, P.z), 10);
        events.push({ k: 'cash', amount: c.pay + bonus, label: bonus ? 'Contract paid, early bonus in' : 'Contract paid' });
        contract.active = null;
      }
    }
  }
  const race = { active: null };
  function startRace(idx) {
    const r = RACES[idx];
    const pts = [];
    let cx = r.x, cz = r.z;
    for (let i = 0; i < 6; i++) {
      const n = pickNodeNear(cx, cz, 130, 260) || { x: cx, z: cz };
      pts.push({ x: n.x, z: n.z }); cx = n.x; cz = n.z;
    }
    pts.push({ x: r.x, z: r.z });
    race.active = { idx, pts, i: 0, timer: 0, splits: [] };
    hud.centerMsg('Go', 1);
  }
  function updateRace(dt, S, P) {
    const r = race.active;
    if (!r) return;
    r.timer += dt;
    const cp = r.pts[r.i];
    if (Math.hypot(cp.x - P.x, cp.z - P.z) < 14) {
      r.splits.push(r.timer);
      hud.centerMsg(`Checkpoint ${r.i + 1} — ${r.timer.toFixed(1)} s`, 1.4);
      r.i++;
      if (r.i >= r.pts.length) {
        const par = RACES[r.idx].par;
        if (r.timer <= par) {
          paySide(S, 800); addStanding(S, districtAt(P.x, P.z), 12);
          events.push({ k: 'cash', amount: 800, label: `Race won — ${r.timer.toFixed(1)} s against par ${par}` });
        } else hud.toast(`Finished in ${r.timer.toFixed(1)} s — par is ${par}. Run it again.`);
        race.active = null;
      }
    }
  }
  const bountyCars = new Map();
  function updateBounties(dt, S, P) {
    BOUNTIES.forEach(([name, model, district, reward], i) => {
      if (S.bountyDone[i] > 0) { S.bountyDone[i] -= dt; return; }
      let car = bountyCars.get(i);
      if (!car) {
        const d = DISTRICTS[district];
        const n = pickNodeNear((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, 0, 200);
        if (!n) return;
        car = spawnCar(model, pick(rng, VEHICLES[model].colors), n.x, n.z, rng() * 6.28, 'bounty');
        car.bountyIdx = i; car.cruise = 12;
        bountyCars.set(i, car);
      }
      if (car.dead) return;
      if (Math.hypot(car.tx - car.x, car.tz - car.z) < 9) {
        const n = pickNodeNear(car.x, car.z, 90, 150) || pick(rng, nodes);
        car.tx = n.x; car.tz = n.z;
      }
      steer(car, dt, car.tx, car.tz, car.cruise);
      // Pin: held still beside the player for three seconds.
      if (Math.abs(car.speed) < 0.5 && Math.hypot(car.x - P.x, car.z - P.z) < 9) {
        car.pinT += dt;
        if (car.pinT > 3) { car.hp = 0; car.dead = true; collectBounty(car); }
      } else car.pinT = 0;
    });
  }
  function collectBounty(car) {
    const i = car.bountyIdx;
    if (i === undefined || bountyCollected.has(i)) return;
    bountyCollected.add(i);
    const [name, , , reward] = BOUNTIES[i];
    events.push({ k: 'bounty', name, reward, car });
    bountyCars.delete(i);
  }
  const bountyCollected = new Set();
  const crew = { car: null, timer: 0, cd: 0 };
  function callCrew(P) {
    if (crew.car || crew.cd > 0) return false;
    const n = pickNodeNear(P.x, P.z, 60, 130);
    if (!n) return false;
    crew.car = spawnCar(2, 0x1c2733, n.x, n.z, 0, 'crew');
    crew.timer = 60;
    hud.subtitle('Dario', 'On my way. Nobody touches you tonight.');
    return true;
  }
  function updateCrew(dt, P) {
    crew.cd = Math.max(0, crew.cd - dt);
    if (!crew.car) return;
    crew.timer -= dt;
    const car = crew.car;
    let tx = P.x - Math.sin(P.heading) * 9, tz = P.z - Math.cos(P.heading) * 9;
    for (const cop of cars) if (cop.role === 'cop' && Math.hypot(cop.x - car.x, cop.z - car.z) < 16) { tx = cop.x; tz = cop.z; }
    steer(car, dt, tx, tz, 40);
    if (crew.timer <= 0 && Math.hypot(car.x - P.x, car.z - P.z) > 200) {
      removeCar(car); crew.car = null; crew.cd = 45;
    } else if (crew.timer <= 0) { tx = car.x + 300; steer(car, dt, tx, car.tz, 44); }
  }
  function addStanding(S, district, pts) {
    S.standing[district] = Math.min(300, (S.standing[district] || 0) + pts);
  }
  /** The one live objective (Fix 2): mission first, then contract, race, gig. */
  function objective() {
    const st = currentStep();
    if (st) {
      if (st.kind === 'escape') return { label: 'Current objective', text: JOB_LINES.escape, x: null, z: null };
      const verb = st.kind === 'pickup' ? 'Pick up at' : 'Drive to';
      return { label: 'Current objective', text: `${verb} ${st.place}`, x: st.x, z: st.z };
    }
    if (contract.active) {
      const c = contract.active;
      const t = c.phase === 0 ? c : { x: c.tx, z: c.tz };
      return { label: `Contract — ${Math.max(0, Math.ceil(c.timer))} s`, text: c.phase === 0 ? `Pick up ${c.client}` : `Take ${c.client} to ${c.dest}`, x: t.x, z: t.z };
    }
    if (race.active) {
      const cp = race.active.pts[race.active.i];
      return { label: `Race — ${race.active.timer.toFixed(0)} s`, text: `Checkpoint ${race.active.i + 1} of ${race.active.pts.length}`, x: cp.x, z: cp.z };
    }
    if (gig.active) {
      const g = gig.active;
      const t = g.phase === 0 ? g : { x: g.tx, z: g.tz };
      return { label: `Gig — ${Math.max(0, Math.ceil(g.timer))} s`, text: g.phase === 0 ? `Pick up at ${g.place}` : `Drop at ${g.dest}`, x: t.x, z: t.z };
    }
    return null;
  }
  /** Radar markers for everything the chart should show. */
  function markers(P, S) {
    const out = [];
    const add = (x, z, type, label, always = false, big = false) => {
      const colors = { place: '#EAF6FF', vehicle: '#4aa3ff', npc: '#5ad05a', mission: '#FFB43A', cop: '#E5484D', stash: '#FFB43A' };
      out.push({ x, z, color: colors[type], label, tag: type, dist: Math.hypot(x - P.x, z - P.z), always, big });
    };
    for (const poi of POIS) add(poi.x, poi.z, 'place', poi.name);
    for (const car of cars) {
      if (car === P.car) continue;
      if (car.role === 'cop') add(car.x, car.z, 'cop', 'Patrol');
      else add(car.x, car.z, 'vehicle', VEHICLES[car.model].name);
    }
    for (const ped of peds) if (ped.role === 'walker') add(ped.x, ped.z, 'npc', 'Pedestrian');
    for (const st of stashMeshes) if (!st.taken && !S.stashesTaken.includes(st.id)) add(st.mesh.position.x, st.mesh.position.z, 'stash', 'Stash');
    const obj = objective();
    if (obj && obj.x !== null) add(obj.x, obj.z, 'mission', 'Objective', true, true);
    return out;
  }
  return {
    cars, peds, events, messages, weather, mission, gig, contract, race, police,
    spawnCar, removeCar, steer, damageCar, addHeat, standDown, callCrew,
    acceptJob, failJob, acceptContract, startRace, objective, markers,
    stashMeshes,
    photoDrop(S, x, z) {
      for (const poi of POIS) if (Math.hypot(poi.x - x, poi.z - z) < 60) {
        paySide(S, 120); S.photoDrops++;
        events.push({ k: 'cash', amount: 120, label: `Photo drop — ${poi.name}` });
        return true;
      }
      return false;
    },
    update(dt, S, P) {
      time += dt;
      P_last = P;
      updateWeather(dt);
      updateTraffic(dt, P);
      updatePeds(dt, P);
      const nearestCop = updatePolice(dt, S, P);
      carCollisions(dt, P, P.car);
      updateMission(dt, S, P);
      updateGig(dt, S, P);
      updateContract(dt, S, P);
      updateRace(dt, S, P);
      updateBounties(dt, S, P);
      updateCrew(dt, P);
      // Stash pickup and rotation shimmer.
      for (const st of stashMeshes) {
        if (st.taken || S.stashesTaken.includes(st.id)) { st.mesh.visible = false; continue; }
        st.mesh.rotation.y += dt * 1.6;
        if (Math.hypot(st.mesh.position.x - P.x, st.mesh.position.z - P.z) < 3.4) {
          st.taken = true; st.mesh.visible = false;
          S.stashesTaken.push(st.id);
          const amount = 150 + randInt(rng, 0, 250);
          paySide(S, amount); addStanding(S, districtAt(P.x, P.z), 5);
          events.push({ k: 'cash', amount, label: 'Stash found' });
        }
      }
      // Rent from owned properties, once a minute.
      S.rentTimer += dt;
      if (S.rentTimer > 60) {
        S.rentTimer = 0;
        let rent = 0;
        PROPERTIES.forEach((p, i) => { if (S.properties[i]) rent += p.rent; });
        if (rent > 0) { paySide(S, rent); hud.toast(`Rent in — +$${rent}`); }
      }
      // Bounty payouts land here so state stays in one place.
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].k === 'bounty') {
          paySide(S, events[i].reward); addStanding(S, districtAt(P.x, P.z), 14);
          S.bountyDone[events[i].car.bountyIdx] = 150;
          hud.toast(`Bounty collected — ${events[i].name}, +$${events[i].reward}`);
        }
      }
      return { nearestCop };
    },
  };
}
