// The camera drone and photo mode share one idea: a free camera.
// The drone is a little quadcopter the player launches with G — 45 seconds
// of battery, and hovering over a point of interest to drop a photo pays
// side cash. Photo mode (P) is the photographer's version: the world
// freezes, the HUD hides, and F counts a shot in the career stats.

import * as THREE from 'three';
import { DRONE_BATTERY_SECONDS, DRONE_PHOTO_PAY, POIS } from './config.js';

const DRONE_SPEED = 15;
const DRONE_MAX_HEIGHT = 60;
const PHOTO_RANGE = 30;
const PHOTO_COOLDOWN_SECONDS = 120;

export function createDrone(scene, world, camera) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), new THREE.MeshLambertMaterial({ color: 0x2a313c }));
  mesh.add(body);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: 0x18e0ff }));
  eye.position.set(0, -0.05, 0.3);
  mesh.add(eye);
  const rotors = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), body.material);
    arm.position.set(sx * 0.34, 0.05, sz * 0.34);
    mesh.add(arm);
    const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.21, 10), new THREE.MeshBasicMaterial({ color: 0xaeb9c6, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    rotor.rotation.x = -Math.PI / 2;
    rotor.position.set(sx * 0.4, 0.1, sz * 0.4);
    mesh.add(rotor);
    rotors.push(rotor);
  }
  mesh.visible = false;
  scene.add(mesh);

  const photoReadyAt = new Map(); // poi id -> world time it can pay again
  const drone = {
    active: false,
    battery: 1,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pay: DRONE_PHOTO_PAY,
    launch(from) {
      this.active = true;
      this.battery = 1;
      this.x = from.x;
      this.z = from.z;
      this.y = 2.2;
      this.yaw = from.angle ?? 0;
      mesh.visible = true;
    },
    land() {
      this.active = false;
      mesh.visible = false;
    },
    /** The POI a photo would capture right now, or null. */
    photoTarget() {
      for (const poi of POIS) {
        if (Math.hypot(poi.x - this.x, poi.z - this.z) < PHOTO_RANGE) {
          if ((photoReadyAt.get(poi.id) ?? -1) <= world.time()) return poi;
        }
      }
      return null;
    },
    takePhoto() {
      const poi = this.photoTarget();
      if (poi) photoReadyAt.set(poi.id, world.time() + PHOTO_COOLDOWN_SECONDS);
      return poi;
    },
    update(dt, input) {
      if (!this.active) return false;
      this.battery -= dt / DRONE_BATTERY_SECONDS;
      if (this.battery <= 0) {
        this.land();
        return false;
      }
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) this.yaw += 1.7 * dt;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) this.yaw -= 1.7 * dt;
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      let mx = 0;
      let mz = 0;
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) { mx += fx; mz += fz; }
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) { mx -= fx; mz -= fz; }
      this.x += mx * DRONE_SPEED * dt;
      this.z += mz * DRONE_SPEED * dt;
      if (input.isDown('Space')) this.y += 9 * dt;
      if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) this.y -= 9 * dt;
      this.y = THREE.MathUtils.clamp(this.y, 1.2, DRONE_MAX_HEIGHT);
      const fixed = world.collide(this.x, this.z, 0.4);
      this.x = fixed.x;
      this.z = fixed.z;
      mesh.position.set(this.x, this.y, this.z);
      mesh.rotation.y = this.yaw;
      for (const rotor of rotors) rotor.rotation.z += dt * 40;
      camera.position.set(this.x, this.y, this.z);
      camera.lookAt(this.x + fx * 12, this.y - 1.6, this.z + fz * 12);
      return true;
    },
  };
  return drone;
}

/** Photo mode: a free camera while the simulation is paused. */
export function createPhotoMode(camera) {
  const mode = {
    active: false,
    x: 0,
    y: 6,
    z: 0,
    yaw: 0,
    pitch: 0.25,
    enter(from, yaw) {
      this.active = true;
      this.x = from.x;
      this.z = from.z;
      this.y = (from.y ?? 0) + 5;
      this.yaw = yaw;
      document.body.classList.add('photo');
    },
    exit() {
      this.active = false;
      document.body.classList.remove('photo');
    },
    update(dt, input) {
      if (!this.active) return;
      if (input.isDown('KeyA')) this.yaw += 1.6 * dt;
      if (input.isDown('KeyD')) this.yaw -= 1.6 * dt;
      if (input.isDown('ArrowUp')) this.pitch = Math.min(1.2, this.pitch + 1.1 * dt);
      if (input.isDown('ArrowDown')) this.pitch = Math.max(-0.6, this.pitch - 1.1 * dt);
      const fx = Math.sin(this.yaw) * Math.cos(this.pitch);
      const fy = Math.sin(this.pitch);
      const fz = Math.cos(this.yaw) * Math.cos(this.pitch);
      let speed = 0;
      if (input.isDown('KeyW')) speed = 16;
      if (input.isDown('KeyS')) speed = -16;
      this.x += fx * speed * dt;
      this.z += fz * speed * dt;
      this.y += fy * speed * dt;
      if (input.isDown('Space')) this.y += 8 * dt;
      if (input.isDown('ShiftLeft')) this.y -= 8 * dt;
      this.y = Math.max(0.6, this.y);
      camera.position.set(this.x, this.y, this.z);
      camera.lookAt(this.x + fx * 10, this.y + fy * 10, this.z + fz * 10);
    },
  };
  return mode;
}
