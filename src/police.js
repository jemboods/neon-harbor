// The Azul PD: a heat level behind the five stars, cruiser pursuit that
// steers with the shared car AI, roadblocks with spike strips at four
// stars, and a searchlight helicopter at three that loses the player when
// rooftops break its line of sight. Being cornered while slow or on foot
// fills a bust meter; a bust costs cash and clears the heat.

import * as THREE from 'three';
import {
  CRUISERS_PER_STAR, GRID, HEAT_DECAY_SECONDS, HELI_LOSE_SIGHT_SECONDS, HELI_MIN_STARS,
  MAX_STARS, ROADBLOCK_MIN_STARS,
} from './config.js';

const SIGHT_RANGE = 62;
const SPAWN_MIN = 78;
const SPAWN_MAX = 118;
const DESPAWN_RANGE = 175;
const BUST_RANGE = 8;
const BUST_SECONDS = 2.6;
export const BUST_FINE = 300;

/** Is the straight line between two ground points free of buildings? */
function losClear(world, x1, z1, x2, z2, minH) {
  const dist = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(1, Math.floor(dist / 4));
  for (let i = 1; i < steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const z = z1 + ((z2 - z1) * i) / steps;
    for (const c of world.colliders) {
      if (c.h >= minH && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
    }
  }
  return true;
}

export function createPolice(scene, world, vehicles, rng) {
  let heat = 0;
  let unseen = 0;
  let lastKnown = null;
  let bust = 0;
  let spikeTimer = 0;
  let blockCooldown = 0;
  const cruisers = [];
  let block = null; // {cars:[], strip, x, z, spiked}

  // ---- helicopter build
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5.2), new THREE.MeshLambertMaterial({ color: 0xe8ecf2 }));
  heli.add(heliBody);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.7), new THREE.MeshBasicMaterial({ color: 0x222831 }));
  rotor.position.y = 1.1;
  heli.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), new THREE.MeshLambertMaterial({ color: 0x39424f }));
  tail.position.set(0, 0.2, -4);
  heli.add(tail);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7.5, 27, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  cone.position.y = -14.5;
  heli.add(cone);
  const spot = new THREE.SpotLight(0xfff6c8, 0, 70, 0.42, 0.5);
  heli.add(spot);
  heli.add(spot.target);
  spot.target.position.set(0, -27, 0);
  heli.visible = false;
  scene.add(heli);
  let heliActive = false;
  let heliLostFor = 0;
  const heliPos = { x: 0, z: 0 };

  const stars = () => (heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(heat)));

  function spawnPoint(target) {
    for (let tries = 0; tries < 8; tries++) {
      const gx = rng.int(-GRID.half, GRID.half) * GRID.pitch;
      const gz = rng.int(-GRID.half, GRID.half) * GRID.pitch;
      const d = Math.hypot(gx - target.x, gz - target.z);
      if (d > SPAWN_MIN && d < SPAWN_MAX) return { x: gx, z: gz };
    }
    return { x: target.x + SPAWN_MIN, z: target.z };
  }

  function makeBlock(target) {
    // Ahead of the target's heading, snapped onto the road it is driving on.
    const ahead = 64;
    const ax = target.x + Math.sin(target.angle) * ahead;
    const az = target.z + Math.cos(target.angle) * ahead;
    const onVertical = Math.abs(Math.sin(target.angle)) < Math.abs(Math.cos(target.angle));
    const line = Math.round((onVertical ? ax : az) / GRID.pitch) * GRID.pitch;
    const x = onVertical ? line : THREE.MathUtils.clamp(ax, -224, 224);
    const z = onVertical ? THREE.MathUtils.clamp(az, -224, 224) : line;
    const cars = [];
    for (const off of [-3.6, 3.6]) {
      const car = vehicles.spawnCar('interceptor', onVertical ? x + off : x, onVertical ? z : z + off, onVertical ? Math.PI / 2 + 0.4 : 0.4, 'police');
      car.parked = true;
      cars.push(car);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(onVertical ? 13 : 1.4, 0.09, onVertical ? 1.4 : 13), new THREE.MeshLambertMaterial({ color: 0x22262c, emissive: 0x888888, emissiveIntensity: 0.25 }));
    strip.position.set(x, 0.06, z);
    scene.add(strip);
    return { cars, strip, x, z, vertical: onVertical, spiked: false };
  }

  function dropBlock() {
    if (!block) return;
    for (const car of block.cars) vehicles.removeCar(car);
    scene.remove(block.strip);
    block = null;
    blockCooldown = 7;
  }

  return {
    get heat() { return heat; },
    get stars() { return stars(); },
    get bustMeter() { return bust / BUST_SECONDS; },
    get spikeTimer() { return spikeTimer; },
    cruisers,
    reportCrime(amount) {
      heat = Math.min(MAX_STARS, heat + amount);
      unseen = 0;
    },
    setHeat(value) {
      heat = THREE.MathUtils.clamp(value, 0, MAX_STARS);
      unseen = 0;
      lastKnown = null;
    },
    clearHeat() {
      heat = 0;
      unseen = 0;
      lastKnown = null;
      bust = 0;
    },
    /** Can any unit see the target right now? (Used by escape jobs.) */
    isSeen() {
      return unseen < 0.4 && heat > 0;
    },
    update(dt, target, hooks) {
      const starCount = stars();
      spikeTimer = Math.max(0, spikeTimer - dt);
      blockCooldown = Math.max(0, blockCooldown - dt);

      // ---- sight: cruisers by eye, the helicopter from above
      let seen = false;
      for (const cruiser of cruisers) {
        if (cruiser.dead) continue;
        const d = Math.hypot(cruiser.x - target.x, cruiser.z - target.z);
        if (d < SIGHT_RANGE && losClear(world, cruiser.x, cruiser.z, target.x, target.z, 2)) {
          seen = true;
          break;
        }
      }
      let heliSees = false;
      if (heliActive) {
        heliSees = losClear(world, heliPos.x, heliPos.z, target.x, target.z, 15);
        heliLostFor = heliSees ? 0 : heliLostFor + dt;
        if (heliSees) seen = true;
      }
      if (seen) {
        lastKnown = { x: target.x, z: target.z };
        unseen = 0;
      } else {
        unseen += dt;
        if (unseen > HEAT_DECAY_SECONDS && heat > 0) {
          heat = Math.max(0, Math.floor(heat - 0.001));
          unseen = HEAT_DECAY_SECONDS - 6; // keep cooling, a star every few seconds
        }
      }

      // ---- cruisers: keep the count the stars demand
      const wanted = starCount > 0 ? CRUISERS_PER_STAR[starCount] : 0;
      for (let i = cruisers.length - 1; i >= 0; i--) {
        const cruiser = cruisers[i];
        const d = Math.hypot(cruiser.x - target.x, cruiser.z - target.z);
        if (d > DESPAWN_RANGE || (i >= wanted && d > 40)) {
          vehicles.removeCar(cruiser);
          cruisers.splice(i, 1);
        }
      }
      while (cruisers.length < wanted) {
        const at = spawnPoint(target);
        cruisers.push(vehicles.spawnCar('interceptor', at.x, at.z, rng.range(0, Math.PI * 2), 'police'));
      }
      for (const cruiser of cruisers) {
        if (cruiser.dead) continue;
        const goal = lastKnown ?? target;
        const d = vehicles.steerToward(cruiser, goal.x, goal.z, dt, { speedScale: target.inCar ? 0.99 : 0.6, slowRadius: target.inCar ? 5 : 9 });
        if (!target.inCar && d < 5.5) cruiser.speed = 0; // corner the walker, don't run him down
        const bar = cruiser.mesh.userData.lightBar;
        if (bar) bar.rotation.y = world.time() * 9 + cruiser.id;
      }

      // ---- bust meter
      let cornered = false;
      if (heat > 0) {
        if (!target.inCar) {
          cornered = cruisers.some((c) => !c.dead && Math.hypot(c.x - target.x, c.z - target.z) < BUST_RANGE);
        } else if (target.carDead || Math.abs(target.carSpeed) < 1.2) {
          const near = cruisers.filter((c) => !c.dead && Math.hypot(c.x - target.x, c.z - target.z) < BUST_RANGE + 2).length;
          cornered = near >= 2;
        }
      }
      bust = cornered ? bust + dt : Math.max(0, bust - dt * 1.6);
      if (bust >= BUST_SECONDS) {
        bust = 0;
        this.clearHeat();
        if (hooks?.onBusted) hooks.onBusted();
      }

      // ---- helicopter
      heliActive = starCount >= HELI_MIN_STARS;
      heli.visible = heliActive;
      if (heliActive) {
        const goal = heliSees || heliLostFor < HELI_LOSE_SIGHT_SECONDS ? target : (lastKnown ?? target);
        heliPos.x += (goal.x - heliPos.x) * Math.min(1, dt * 1.4);
        heliPos.z += (goal.z - heliPos.z) * Math.min(1, dt * 1.4);
        heli.position.set(heliPos.x, 27, heliPos.z);
        rotor.rotation.y += dt * 28;
        spot.intensity = 900;
        cone.material.opacity = heliSees ? 0.17 : 0.07;
      }

      // ---- roadblock
      if (starCount >= ROADBLOCK_MIN_STARS && target.inCar) {
        if (!block && blockCooldown <= 0) block = makeBlock(target);
      } else if (block) {
        dropBlock();
      }
      if (block) {
        const d = Math.hypot(block.x - target.x, block.z - target.z);
        const overStrip = Math.abs(block.x - target.x) < (block.vertical ? 6.5 : 1.7) && Math.abs(block.z - target.z) < (block.vertical ? 1.7 : 6.5);
        if (d > 150) {
          dropBlock();
        } else {
          if (!block.spiked && overStrip && Math.abs(target.carSpeed) > 4) {
            block.spiked = true;
            spikeTimer = 6;
            if (hooks?.onSpike) hooks.onSpike();
          }
          for (const car of block.cars) {
            car.mesh.position.set(car.x, 0, car.z);
            car.mesh.rotation.y = car.angle;
          }
        }
      }
    },
  };
}
