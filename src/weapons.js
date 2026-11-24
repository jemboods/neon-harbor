// Weapons: four hitscan guns behind a Q-hold wheel. Damage lands on
// vehicles only — pedestrians scatter, nobody bleeds. Tracers are a small
// pool of fading lines; magazines reload on R or automatically when dry.

import * as THREE from 'three';
import { WEAPONS, WEAPON_RANGE } from './config.js';

const TRACER_COUNT = 28;
const TRACER_LIFE = 0.07;

export function createWeapons(scene, audio, damageCar, hooks) {
  let selected = 0;
  const mags = WEAPONS.map((w) => w.mag);
  let lastShotAt = -1e9;
  let reloadUntil = 0;
  let wheelOpen = false;

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerAt = 0;
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffca6a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.scale.set(0.9, 0.9, 1);
  scene.add(flash);
  let flashLife = 0;

  function drawTracer(from, to) {
    const tracer = tracers[tracerAt];
    tracerAt = (tracerAt + 1) % TRACER_COUNT;
    const pos = tracer.line.geometry.attributes.position.array;
    pos[0] = from.x;
    pos[1] = from.y;
    pos[2] = from.z;
    pos[3] = to.x;
    pos[4] = to.y;
    pos[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = TRACER_LIFE;
  }

  /** One pellet's nearest car along the ray, or null. Cars are spheres here. */
  function raycastCar(origin, dir, cars, selfCar) {
    let best = null;
    let bestT = WEAPON_RANGE;
    for (const car of cars) {
      if (car === selfCar || car.dead) continue;
      const cx = car.x - origin.x;
      const cy = 0.9 - origin.y;
      const cz = car.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 1 || t > bestT) continue;
      const px = origin.x + dir.x * t - car.x;
      const py = origin.y + dir.y * t - 0.9;
      const pz = origin.z + dir.z * t - car.z;
      const r = car.spec.len * 0.52;
      if (px * px + py * py + pz * pz < r * r) {
        best = car;
        bestT = t;
      }
    }
    return best ? { car: best, t: bestT } : null;
  }

  return {
    get selected() { return selected; },
    get wheelOpen() { return wheelOpen; },
    setWheel(open) { wheelOpen = open; },
    select(index) {
      if (index >= 0 && index < WEAPONS.length) {
        selected = index;
        reloadUntil = 0;
      }
    },
    weapon: () => WEAPONS[selected],
    ammoText: () => (performance.now() < reloadUntil ? 'RELOADING' : `${mags[selected]} / ∞`),
    isReloading: () => performance.now() < reloadUntil,
    reload() {
      const w = WEAPONS[selected];
      if (mags[selected] < w.mag && performance.now() >= reloadUntil) {
        reloadUntil = performance.now() + w.reloadMs;
        audio.reload();
      }
    },
    /**
     * Fire from origin along dir (a unit vector). cars is the live car list;
     * selfCar (the shooter's own ride) is never hit. Returns true if a shot left.
     */
    tryFire(origin, dir, cars, selfCar) {
      const now = performance.now();
      const w = WEAPONS[selected];
      if (now - lastShotAt < w.rateMs || now < reloadUntil) return false;
      if (mags[selected] <= 0) {
        this.reload();
        return false;
      }
      lastShotAt = now;
      mags[selected]--;
      audio.shot(w.id);
      flash.position.set(origin.x + dir.x, origin.y + dir.y, origin.z + dir.z);
      flashLife = 0.05;
      flash.material.opacity = 0.9;
      for (let p = 0; p < w.pellets; p++) {
        const jitter = () => (Math.random() - 0.5) * 2 * w.spread;
        const d = new THREE.Vector3(dir.x + jitter(), dir.y + jitter() * 0.6, dir.z + jitter()).normalize();
        const hit = raycastCar(origin, d, cars, selfCar);
        const end = hit
          ? { x: origin.x + d.x * hit.t, y: origin.y + d.y * hit.t, z: origin.z + d.z * hit.t }
          : { x: origin.x + d.x * 60, y: origin.y + d.y * 60, z: origin.z + d.z * 60 };
        drawTracer(origin, end);
        if (hit) {
          const died = damageCar(hit.car, w.damage);
          if (hooks?.onCarHit) hooks.onCarHit(hit.car, died);
        }
      }
      if (hooks?.onShot) hooks.onShot(origin);
      if (mags[selected] === 0) this.reload();
      return true;
    },
    update(dt) {
      for (const tracer of tracers) {
        if (!tracer.line.visible) continue;
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.9;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flash.material.opacity = 0;
      }
      if (reloadUntil && performance.now() >= reloadUntil) {
        mags[selected] = WEAPONS[selected].mag;
        reloadUntil = 0;
      }
    },
  };
}
