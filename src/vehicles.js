// Vehicles: one car factory for all nine models, a lane-following traffic
// system, the player's arcade driving model (with drift, wet grip and
// airtime) and a shared steering helper the police, crew, rivals and
// bounty targets all drive with.

import * as THREE from 'three';
import { CAR_HP, GRID, MOD_TIERS, RAM_DAMAGE, TRAFFIC_MODELS, VEHICLES } from './config.js';

export const specOf = (id) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[1];
const TIRE_MAT = new THREE.MeshLambertMaterial({ color: 0x14161a });
const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x10161f });
const HEADLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
const TAILLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xff2e3e });

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  grad.addColorStop(0, 'rgba(70,70,78,0.85)');
  grad.addColorStop(1, 'rgba(70,70,78,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
let sharedSmokeTex = null;

/** Build a car's meshes. Forward is +z in local space; rotation.y = heading. */
export function buildCarMesh(spec, colorHex, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.55, spec.len), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.82, 0.5, spec.len * 0.45), GLASS_MAT);
  cabin.position.set(0, 1.05, -spec.len * 0.05);
  group.add(cabin);
  if (spec.id === 'hauler') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 1.1, spec.len * 0.55), bodyMat);
    box.position.set(0, 1.15, -spec.len * 0.18);
    group.add(box);
  }
  if (spec.id === 'cab') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe28a }));
    sign.position.set(0, 1.42, -spec.len * 0.05);
    group.add(sign);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, TIRE_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (spec.wid / 2 - 0.05), 0.34, sz * (spec.len / 2 - 0.85));
    group.add(wheel);
    wheels.push(wheel);
  }
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), HEADLIGHT_MAT);
    head.position.set(sx * spec.wid * 0.32, 0.62, spec.len / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), TAILLIGHT_MAT);
    tail.position.set(sx * spec.wid * 0.32, 0.66, -spec.len / 2 - 0.02);
    group.add(tail);
  }
  if (opts.police) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    bar.add(red, blue);
    bar.position.set(0, 1.42, -spec.len * 0.05);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.wid + 0.9, spec.len + 0.9),
    new THREE.MeshBasicMaterial({ color: 0x18e0ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.07;
  glow.visible = false;
  group.add(glow);
  group.userData = { ...group.userData, bodyMat, wheels, glow, frontWheels: [wheels[0], wheels[1]] };
  return group;
}

export function createVehicles(scene, world, rng) {
  if (!sharedSmokeTex) sharedSmokeTex = smokeTexture();
  const cars = [];

  function spawnCar(modelId, x, z, angle, kind, opts = {}) {
    const spec = specOf(modelId);
    const color = opts.color ?? spec.color;
    const mesh = buildCarMesh(spec, color, { police: kind === 'police' });
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const car = {
      spec, mesh, kind, x, z, angle, speed: 0, hp: CAR_HP, dead: false,
      color, mods: { paint: 0, glow: 0, grip: 0, turbo: 0, armor: 0 },
      slipX: 0, slipZ: 0, y: 0, vy: 0, airborne: 0, steerVis: 0,
      ai: opts.ai ?? null, smoke: null, name: opts.name ?? null, id: cars.length + Math.floor(rng.next() * 1e6),
    };
    if (opts.mods) Object.assign(car.mods, opts.mods);
    applyMods(car);
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const at = cars.indexOf(car);
    if (at >= 0) cars.splice(at, 1);
  }

  /** Paint, underglow and tier visuals from car.mods. */
  function applyMods(car) {
    const { bodyMat, glow } = car.mesh.userData;
    bodyMat.color.setHex(car.mods.paintColor ?? car.color);
    if (car.mods.glowColor) {
      glow.material.color.setHex(car.mods.glowColor);
      glow.visible = true;
    } else {
      glow.visible = false;
    }
  }

  function damageCar(car, amount) {
    if (car.dead) return false;
    const armorCut = car.kind === 'player' ? 1 - car.mods.armor * MOD_TIERS.armor.perTier : 1;
    car.hp -= amount * armorCut;
    if (!car.smoke) {
      car.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedSmokeTex, transparent: true, opacity: 0, depthWrite: false }));
      car.smoke.scale.set(2.4, 2.4, 1);
      car.smoke.position.set(0, 1.7, car.spec.len * 0.25);
      car.mesh.add(car.smoke);
    }
    if (car.hp <= 0) {
      car.hp = 0;
      car.dead = true;
      car.speed = 0;
      car.mesh.userData.bodyMat.color.multiplyScalar(0.3);
      car.smoke.material.opacity = 0.95;
      return true;
    }
    return false;
  }

  /** Shared integration: heading + speed + slip, ramp height, collisions. */
  function moveCar(car, dt, hooks) {
    const fx = Math.sin(car.angle);
    const fz = Math.cos(car.angle);
    car.x += (fx * car.speed + car.slipX) * dt;
    car.z += (fz * car.speed + car.slipZ) * dt;
    car.slipX *= Math.max(0, 1 - dt * 3.2);
    car.slipZ *= Math.max(0, 1 - dt * 3.2);
    const ground = world.groundHeight(car.x, car.z);
    if (car.y > ground + 0.02 || car.vy > 0) {
      car.vy -= 22 * dt;
      car.y += car.vy * dt;
      car.airborne += dt;
      if (car.y <= ground) {
        if (car.airborne > 0.3 && hooks?.onLand) hooks.onLand(car, car.airborne);
        car.y = ground;
        car.vy = 0;
        car.airborne = 0;
      }
    } else {
      car.y = ground;
      if (ground > 0 && car.speed > 8) car.vy = Math.max(car.vy, car.speed * 0.16); // launching off the crest
    }
    const fixed = world.collide(car.x, car.z, car.spec.len * 0.3);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      car.x = fixed.x;
      car.z = fixed.z;
      if (Math.abs(car.speed) > 7 && hooks?.onWallHit) hooks.onWallHit(car);
      car.speed *= 0.55;
    }
    car.mesh.position.set(car.x, car.y, car.z);
    car.mesh.rotation.y = car.angle;
    car.mesh.rotation.x = car.y > 0 ? -car.vy * 0.012 : 0;
    const spin = car.speed * dt * 2.8;
    for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
    for (const wheel of car.mesh.userData.frontWheels) wheel.rotation.y = car.steerVis * 0.45;
    if (car.smoke) car.smoke.material.opacity = car.dead ? 0.95 : THREE.MathUtils.clamp((55 - car.hp) / 70, 0, 0.7);
  }

  /** Circle collision between the player's car and every other car. */
  function collideCars(a, b, hooks) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const rr = (a.spec.len + b.spec.len) * 0.30;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const overlap = rr - d;
    const relSpeed = Math.abs(a.speed - b.speed) + Math.hypot(a.slipX - b.slipX, a.slipZ - b.slipZ);
    b.x += nx * overlap * 0.6;
    b.z += nz * overlap * 0.6;
    a.x -= nx * overlap * 0.4;
    a.z -= nz * overlap * 0.4;
    b.slipX += nx * relSpeed * 0.45;
    b.slipZ += nz * relSpeed * 0.45;
    if (relSpeed > 6.5) {
      const dmg = RAM_DAMAGE * Math.min(1.6, relSpeed / 12);
      const aDied = damageCar(a, dmg * 0.5);
      const bDied = damageCar(b, dmg);
      if (hooks?.onRam) hooks.onRam(a, b, relSpeed, bDied, aDied);
    }
  }

  // ------------------------------------------------------------- traffic
  const traffic = [];
  function spawnTraffic(count) {
    for (let i = 0; i < count; i++) {
      const axis = rng.chance(0.5) ? 'x' : 'z';
      const line = rng.int(-GRID.half, GRID.half) * GRID.pitch;
      const along = rng.range(-240, 240);
      const dir = rng.chance(0.5) ? 1 : -1;
      const lane = 4.2;
      const x = axis === 'x' ? along : line + (dir > 0 ? lane : -lane);
      const z = axis === 'z' ? along : line + (dir > 0 ? -lane : lane);
      const angle = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
      const car = spawnCar(rng.pick(TRAFFIC_MODELS), x, z, angle, 'traffic', {
        color: new THREE.Color().setHSL(rng.next(), rng.range(0.1, 0.55), rng.range(0.3, 0.62)).getHex(),
      });
      car.ai = { axis, line, dir, cruise: rng.range(8, 13), laneTimer: rng.range(4, 14), overtake: 0 };
      traffic.push(car);
    }
  }

  function updateTraffic(dt, focus, rainLevel) {
    for (const car of traffic) {
      // A car the player has taken (kind changed) is no longer traffic's to drive.
      if (car.dead || car.kind !== 'traffic') continue;
      const ai = car.ai;
      ai.laneTimer -= dt;
      // The coordinate along the road and the cross coordinate.
      const along = ai.axis === 'x' ? car.x : car.z;
      const cross = ai.axis === 'x' ? car.z : car.x;
      const laneSign = ai.axis === 'x' ? (ai.dir > 0 ? -1 : 1) : ai.dir > 0 ? 1 : -1;
      let laneTarget = ai.line + laneSign * 4.2;
      if (ai.overtake > 0) {
        ai.overtake -= dt;
        laneTarget = ai.line - laneSign * 4.2;
      }
      // Slow for anything ahead in the lane (cars, the player, wrecks).
      let blocked = false;
      for (const other of cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const ahead = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
        const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
        if (ahead > 0 && ahead < 8.5 && side < 2.1) {
          blocked = true;
          if (ai.laneTimer <= 0 && ahead < 8.5 && other.speed < ai.cruise - 2) {
            ai.overtake = 2.6;
            ai.laneTimer = rng.range(6, 15);
          }
          break;
        }
      }
      const target = blocked ? 0 : ai.cruise * (1 - rainLevel * 0.15);
      car.speed += THREE.MathUtils.clamp(target - car.speed, -22 * dt, car.spec.accel * 0.55 * dt);
      // Steer: heading follows the road; the cross error bends it gently.
      // Bend sign: along x, more heading turns toward -z; along z, toward +x.
      const crossError = laneTarget - cross;
      const bend = THREE.MathUtils.clamp(crossError * 0.05, -0.3, 0.3) * (ai.axis === 'x' ? -ai.dir : ai.dir);
      const desired = (ai.axis === 'x' ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : ai.dir > 0 ? 0 : Math.PI) + bend;
      let turn = desired - car.angle;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      car.angle += THREE.MathUtils.clamp(turn, -1.6 * dt, 1.6 * dt);
      // At a cross street, sometimes turn onto it.
      const nearCross = Math.abs(along % GRID.pitch) < 3 || Math.abs((along % GRID.pitch) + GRID.pitch) % GRID.pitch < 3;
      if (nearCross && ai.laneTimer <= 0 && rng.chance(0.006)) {
        ai.axis = ai.axis === 'x' ? 'z' : 'x';
        ai.line = Math.round((ai.axis === 'x' ? car.z : car.x) / GRID.pitch) * GRID.pitch;
        ai.dir = rng.chance(0.5) ? 1 : -1;
        ai.laneTimer = rng.range(6, 15);
      }
      void focus;
      moveCar(car, dt, null);
    }
  }

  // ------------------------------------------------------------- player driving
  function drivePlayer(car, input, dt, env, hooks) {
    const spec = car.spec;
    const gripBonus = 1 + car.mods.grip * MOD_TIERS.grip.perTier;
    const turboBonus = 1 + car.mods.turbo * MOD_TIERS.turbo.perTier;
    const wet = 1 - env.rain * 0.35;
    const up = input.isDown('KeyW') || input.isDown('ArrowUp');
    const downKey = input.isDown('KeyS') || input.isDown('ArrowDown');
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const handbrake = input.isDown('Space');
    if (up) car.speed += spec.accel * turboBonus * dt * (car.speed < 0 ? 2.2 : 1);
    else if (downKey) car.speed -= (car.speed > 0.5 ? 20 : spec.accel * 0.7) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt);
    car.speed -= car.speed * 0.25 * dt; // drag
    const top = spec.topSpeed * turboBonus;
    car.speed = THREE.MathUtils.clamp(car.speed, -11, top);
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const steerAuthority = THREE.MathUtils.clamp(Math.abs(car.speed) / 9, 0, 1) * Math.sign(car.speed);
    car.angle += steer * steerAuthority * 1.55 * spec.grip * gripBonus * wet * dt * (handbrake ? 1.5 : 1);
    car.steerVis = THREE.MathUtils.lerp(car.steerVis, steer, dt * 8);
    // Drift: the handbrake feeds the velocity into the slip vector.
    if (handbrake && Math.abs(car.speed) > 6) {
      car.slipX += -Math.cos(car.angle) * steer * car.speed * 1.15 * dt;
      car.slipZ += Math.sin(car.angle) * steer * car.speed * 1.15 * dt;
      if (hooks?.onDrift) hooks.onDrift(car, dt);
    }
    // Near-miss: skimming a traffic car at speed without touching it.
    if (Math.abs(car.speed) > 16) {
      for (const other of cars) {
        if (other === car || other.kind !== 'traffic' || other.dead) continue;
        const d = Math.hypot(other.x - car.x, other.z - car.z);
        if (d > 3.4 && d < 5.2 && !other.nearMissed) {
          other.nearMissed = true;
          setTimeout(() => { other.nearMissed = false; }, 4000);
          if (hooks?.onNearMiss) hooks.onNearMiss(car, other);
        }
      }
    }
    moveCar(car, dt, hooks);
    for (const other of cars) if (other !== car) collideCars(car, other, hooks);
    return { throttle: up ? 1 : 0, speedNorm: Math.abs(car.speed) / top };
  }

  /** AI steering toward a point: used by police, crew, rivals and targets. */
  function steerToward(car, tx, tz, dt, opts = {}) {
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let turn = desired - car.angle;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const maxTurn = (opts.turnRate ?? 2.1) * dt;
    car.angle += THREE.MathUtils.clamp(turn, -maxTurn, maxTurn);
    car.steerVis = THREE.MathUtils.clamp(turn, -1, 1);
    const topSpeed = car.spec.topSpeed * (opts.speedScale ?? 0.92);
    let target = dist < (opts.slowRadius ?? 6) ? topSpeed * 0.35 : topSpeed;
    if (Math.abs(turn) > 1.9) target = Math.min(target, 5); // turn around instead of orbiting
    car.speed += THREE.MathUtils.clamp(target - car.speed, -26 * dt, car.spec.accel * dt);
    moveCar(car, dt, null);
    return dist;
  }

  return { cars, spawnCar, removeCar, applyMods, damageCar, moveCar, spawnTraffic, updateTraffic, drivePlayer, steerToward, traffic };
}
