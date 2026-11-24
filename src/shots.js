// The screenshot scenes behind ?shot=cover|drive|chase|side. Each one
// stages the real game — the seeded city, real cars, the real police —
// steps the simulation a fixed number of steps and parks the camera, so
// the same seed always gives the same frame.

import { MOD_SHOP } from './config.js';

const STEP = 1 / 60;

function stepWorld(ctx, steps, focus) {
  const env = { scene: ctx.view.scene, sun: ctx.view.sun, hemi: ctx.view.hemi, ambient: ctx.view.ambient };
  for (let i = 0; i < steps; i++) {
    ctx.world.update(STEP, focus, env);
    ctx.vehicles.updateTraffic(STEP, focus, 0);
  }
}

function parkCamera(ctx, x, y, z, tx, ty, tz) {
  ctx.view.camera.position.set(x, y, z);
  ctx.view.camera.lookAt(tx, ty, tz);
}

/** Cover: the hero car on the marina promenade at sunset, windows lit. */
function cover(ctx) {
  const { world, vehicles, player } = ctx;
  world.setCycle(0.5);
  const car = vehicles.spawnCar('voltgt', -136, 214, 2.25, 'parked');
  player.x = -132.5;
  player.z = 217;
  player.angle = 2.4;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.angle;
  stepWorld(ctx, 50, { x: -136, z: 214 });
  parkCamera(ctx, -128.5, 2.4, 221.5, -136, 1.2, 214);
  return car;
}

/** Drive: a Corso at speed through Centro in the morning. */
function drive(ctx) {
  const { world, vehicles, player } = ctx;
  world.setCycle(0.3);
  const car = vehicles.spawnCar('corso', 0, -40, Math.PI, 'player');
  player.enterCar(car);
  car.speed = 17;
  const env = { scene: ctx.view.scene, sun: ctx.view.sun, hemi: ctx.view.hemi, ambient: ctx.view.ambient };
  for (let i = 0; i < 46; i++) {
    world.update(STEP, { x: car.x, z: car.z }, env);
    vehicles.updateTraffic(STEP, { x: car.x, z: car.z }, 0);
    vehicles.moveCar(car, STEP, null);
    car.speed = 17;
  }
  parkCamera(ctx, car.x - Math.sin(car.angle) * 8.6, 3.1, car.z - Math.cos(car.angle) * 8.6, car.x + Math.sin(car.angle) * 7, 1.2, car.z + Math.cos(car.angle) * 7);
}

/** Chase: five stars at night — cruisers, a roadblock, the searchlight. */
function chase(ctx) {
  const { world, vehicles, player, police } = ctx;
  world.setCycle(0.97);
  const car = vehicles.spawnCar('voltgt', 0, -10, 0, 'player');
  player.enterCar(car);
  car.speed = 12;
  police.setHeat(5);
  const env = { scene: ctx.view.scene, sun: ctx.view.sun, hemi: ctx.view.hemi, ambient: ctx.view.ambient };
  const target = { x: car.x, z: car.z, angle: 0, inCar: true, carSpeed: 12, carDead: false };
  for (let i = 0; i < 170; i++) {
    world.update(STEP, target, env);
    vehicles.updateTraffic(STEP, target, 0);
    police.update(STEP, target, {});
    vehicles.moveCar(car, STEP, null);
    car.speed = 12;
    target.x = car.x;
    target.z = car.z;
  }
  parkCamera(ctx, car.x - Math.sin(car.angle) * 11, 4.2, car.z - Math.cos(car.angle) * 11, car.x, 1.4, car.z);
}

/** Side: the Neon Works Garage — a painted, glowing build on the lift. */
function side(ctx) {
  const { world, vehicles, player } = ctx;
  world.setCycle(0.8);
  const car = vehicles.spawnCar('fluxs', MOD_SHOP.x, MOD_SHOP.z, 0.7, 'parked');
  car.mods.paint = 1;
  car.mods.paintColor = 0x18e0e8;
  car.mods.glow = 1;
  car.mods.glowColor = 0x18e0ff;
  vehicles.applyMods(car);
  player.x = MOD_SHOP.x + 3.4;
  player.z = MOD_SHOP.z + 2.6;
  player.angle = -0.9;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.angle;
  stepWorld(ctx, 40, { x: MOD_SHOP.x, z: MOD_SHOP.z });
  parkCamera(ctx, MOD_SHOP.x + 7.5, 2.4, MOD_SHOP.z + 8.5, MOD_SHOP.x, 1, MOD_SHOP.z);
}

export function stageShot(name, ctx) {
  if (name === 'drive') drive(ctx);
  else if (name === 'chase') chase(ctx);
  else if (name === 'side') side(ctx);
  else cover(ctx);
}
