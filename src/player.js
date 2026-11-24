// The player on foot: a small articulated figure, WASD movement relative to
// the camera, sprinting, and the chase camera rig that follows both the
// walker and the car. Camera yaw can be dragged with the right mouse button.

import * as THREE from 'three';

const WALK_SPEED = 5.4;
const SPRINT_MULT = 1.75;
const FOOT_RADIUS = 0.45;

export function createPlayer(scene, world) {
  const mesh = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: 0x22384f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a37e });
  const accent = new THREE.MeshLambertMaterial({ color: 0xe83a9f });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), suit);
  legL.position.set(-0.11, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), suit);
  torso.position.y = 0.86;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.1, 0.27), accent);
  stripe.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.27), skin);
  head.position.y = 1.34;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), accent);
  cap.position.y = 1.5;
  mesh.add(legL, legR, torso, stripe, head, cap);
  scene.add(mesh);

  const player = {
    mesh,
    x: -140,
    z: 222,
    angle: 0,
    car: null,
    walkPhase: 0,
    /** The position other systems aim at: the car when driving, the walker otherwise. */
    focus() {
      return this.car ? { x: this.car.x, z: this.car.z } : { x: this.x, z: this.z };
    },
    enterCar(car) {
      this.car = car;
      car.kind = 'player';
      mesh.visible = false;
    },
    exitCar() {
      if (!this.car) return;
      const car = this.car;
      this.car = null;
      // A plain traffic car with no mods fitted is its driver's again and
      // rejoins traffic; anything the player has invested in stays parked.
      const invested = car.mods.paint > 0 || car.mods.glow > 0 || car.mods.grip > 0 || car.mods.turbo > 0 || car.mods.armor > 0;
      car.kind = car.ai && !invested ? 'traffic' : 'parked';
      this.x = car.x - Math.cos(car.angle) * 1.6;
      this.z = car.z + Math.sin(car.angle) * 1.6;
      const fixed = world.collide(this.x, this.z, FOOT_RADIUS);
      this.x = fixed.x;
      this.z = fixed.z;
      mesh.visible = true;
    },
    update(dt, input, camYaw) {
      if (this.car) return;
      const axis = input.moveAxis();
      const moving = axis.x !== 0 || axis.z !== 0;
      if (moving) {
        const len = Math.hypot(axis.x, axis.z);
        const sin = Math.sin(camYaw);
        const cos = Math.cos(camYaw);
        // View forward is (sin, cos); screen right is (-cos, sin). W is axis.z -1.
        const dx = (-axis.z * sin - axis.x * cos) / len;
        const dz = (-axis.z * cos + axis.x * sin) / len;
        const speed = WALK_SPEED * (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? SPRINT_MULT : 1);
        this.x += dx * speed * dt;
        this.z += dz * speed * dt;
        this.angle = Math.atan2(dx, dz);
        this.walkPhase += dt * speed * 1.9;
        const fixed = world.collide(this.x, this.z, FOOT_RADIUS);
        this.x = fixed.x;
        this.z = fixed.z;
      }
      const swing = moving ? Math.sin(this.walkPhase) * 0.5 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      mesh.position.set(this.x, world.groundHeight(this.x, this.z), this.z);
      mesh.rotation.y = this.angle;
    },
  };
  mesh.position.set(player.x, 0, player.z);
  return player;
}

/** A smoothed chase camera: behind the target's heading, draggable yaw offset. */
export function createCameraRig(camera, world) {
  const rig = {
    yaw: Math.PI,
    pitch: 0.32,
    dist: 8.5,
    height: 3.2,
    dragging: false,
    snap(yaw) {
      this.yaw = yaw;
    },
    /** Follow a target {x, z, angle, speed} — or, in free mode, a raw position. */
    update(dt, target, mode) {
      if (mode === 'free') return; // drone/photo code drives the camera itself
      let wantYaw = target.angle;
      // Blend yaw the short way around.
      let diff = wantYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (!this.dragging) this.yaw += diff * Math.min(1, dt * (target.speed > 2 ? 3.2 : 1.6));
      const dist = mode === 'car' ? 9.5 + Math.abs(target.speed) * 0.06 : this.dist;
      const cx = target.x - Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
      const cz = target.z - Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
      const cy = (target.y ?? 0) + Math.sin(this.pitch) * dist + (mode === 'car' ? 1.6 : 0.6);
      const fixed = world.collide(cx, cz, 0.5);
      camera.position.set(fixed.x, Math.max(0.7, cy), fixed.z);
      camera.lookAt(target.x, (target.y ?? 0) + 1.6, target.z);
    },
  };
  window.addEventListener('mousedown', (e) => {
    if (e.button === 2) rig.dragging = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) rig.dragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!rig.dragging) return;
    rig.yaw -= e.movementX * 0.005;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + e.movementY * 0.004, 0.05, 1.1);
  });
  return rig;
}
