// Screenshot staging behind ?shot=title|drive|bust|phone&seed=1. Each scene is
// built on the real systems, painted twice, then window.__shotReady is set.
import { INTERCEPTOR, POIS } from './config.js';

export function stageShot(name, ctx) {
  const { S, sys, player, hud, camera, renderer, scene, city } = ctx;
  S.hour = name === 'title' ? 18.4 : 17.3; // the action shots sit in brighter late light
  city.update(S.hour, 0);
  if (name === 'drive') {
    ctx.startGame(false);
    ctx.closeHelp();
    sys.acceptJob(S); // job 1: the ride to Pier 3, objective line on the HUD
    const car = ctx.nearestCar(60) || sys.cars[0];
    if (car) {
      car.x = -330; car.z = 200; // the Pier 3 road, mid-run south
      car.heading = Math.atan2(POIS[0].x - car.x, POIS[0].z - car.z);
      car.view.group.position.set(car.x, 0, car.z);
      car.view.group.rotation.y = car.heading - Math.PI / 2;
      player.x = car.x; player.z = car.z;
      ctx.enterCar(car);
      player.x = car.x; player.z = car.z;
      car.speed = 14; player.speed = 14; // rolling: speedo up, wheels turned over
      car.view.update(26, 1.2, false);
    }
    camera.position.set(player.x - Math.sin(player.heading) * 12.5, 6.4, player.z - Math.cos(player.heading) * 12.5);
    camera.lookAt(player.x + Math.sin(player.heading) * 6, 1.6, player.z + Math.cos(player.heading) * 6);
    ctx.paintHud(0, null);
  } else if (name === 'bust') {
    ctx.startGame(false);
    ctx.closeHelp();
    player.x = POIS[3].x + 2; player.z = POIS[3].z + 4;
    player.heading = 2.4;
    ctx.hero.group.position.set(player.x, 0, player.z); // no step runs in shot mode: place him by hand
    ctx.hero.group.rotation.y = player.heading;
    const cop = sys.spawnCar(INTERCEPTOR, 0x1f3b73, player.x + 4.2, player.z + 1.5, 2.6, 'cop');
    cop.view.group.position.set(cop.x, 0, cop.z);
    S.heat = 35; S.stars = 2; S.bust = 64;
    camera.position.set(player.x - Math.sin(player.heading) * 9, 3.6, player.z - Math.cos(player.heading) * 9);
    camera.lookAt(player.x + 2, 1.4, player.z);
    ctx.paintHud(0, null);
  } else if (name === 'phone') {
    ctx.startGame(false);
    ctx.closeHelp();
    ctx.hero.group.position.set(player.x, 0, player.z);
    ctx.hero.group.rotation.y = player.heading;
    ctx.openPhone(1); // the jobs ledger, cargo-manifest styling
    camera.position.set(player.x - 6, 3.2, player.z - 8);
    camera.lookAt(player.x, 1.4, player.z + 4);
    ctx.paintHud(0, null);
  } else { // title
    hud.setTitle(true, false);
    camera.position.set(30, 23, 566);
    camera.lookAt(-20, 9, 360);
    ctx.paintHud(0, null);
  }
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted++;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}
