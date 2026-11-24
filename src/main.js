// Neon Harbor: Streets of Azul — boot and the one loop.
// Fixed-step simulation (1/60 s) under a requestAnimationFrame renderer.
// Screens: title, play, pause, plus overlays (phone, weapon wheel, mod
// shop, photo mode) that layer over play. ?shot=name&seed=N stages a
// deterministic screenshot scene instead of running the loop.

import * as THREE from 'three';
import { CHAPTERS, MOD_SHOP, STASHES, STASH_REWARD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createRenderer } from './render.js';
import { createWorld, districtAt, districtName } from './world.js';
import { createVehicles } from './vehicles.js';
import { createPlayer, createCameraRig } from './player.js';
import { createPolice, BUST_FINE } from './police.js';
import { createWeapons } from './weapons.js';
import { createDrone, createPhotoMode } from './drone.js';
import { createProgression } from './progression.js';
import { createProperties } from './properties.js';
import { createMissions } from './missions.js';
import { createPhone } from './phone.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 12;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261123;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);
const view = createRenderer(canvas);
const world = createWorld(view.scene, rng);
const vehicles = createVehicles(view.scene, world, rng);
vehicles.spawnTraffic(16);
const player = createPlayer(view.scene, world);
const rig = createCameraRig(view.camera, world);
const police = createPolice(view.scene, world, vehicles, rng);
const audio = createAudio();
const input = createInput();
const progression = createProgression();

// UI facade: missions/properties are built before the phone and HUD exist,
// so their hooks call through this table, filled in below.
const ui = {
  toast: () => {}, banner: () => {}, marisol: () => {},
  cashSound: () => {}, jobSound: () => {}, failSound: () => {},
};

const weapons = createWeapons(view.scene, audio, (car, amount) => vehicles.damageCar(car, amount), {
  onShot: (origin) => {
    progression.state.stats.shotsFired++;
    police.reportCrime(0.34);
    world.setPanic(origin.x, origin.z, 17);
  },
  onCarHit: (car, died) => {
    police.reportCrime(car.kind === 'police' ? 0.55 : 0.22);
    if (died) police.reportCrime(0.3);
    audio.hit();
  },
});
const drone = createDrone(view.scene, world, view.camera);
const photoMode = createPhotoMode(view.camera);

let lastDrivenCar = null;
const properties = createProperties(view.scene, world, vehicles, progression, {
  onToast: (t) => ui.toast(t),
  onCashSound: () => ui.cashSound(),
  onStoreCar: (car) => {
    player.exitCar();
    vehicles.removeCar(car);
    lastDrivenCar = null;
  },
  onTakeCar: () => {},
});

const missions = createMissions({
  world, vehicles, police, progression, rng, scene: view.scene,
  hooks: {
    onToast: (t) => ui.toast(t),
    onMarisol: (text) => ui.marisol(text),
    onChapter: (ch) => ui.banner(`Chapter ${ch + 1}`, CHAPTERS[ch]),
    onJobPaid: (jobDef) => {
      ui.cashSound();
      ui.jobSound();
      ui.toast(`💼 ${jobDef.title} — +$${jobDef.payout.toLocaleString()} toward the debt`);
      if (progression.debtLeft() <= 0) ui.banner('DEBT CLEARED', 'Marisol bows. Azul is yours.');
    },
    onSidePaid: (t) => {
      ui.cashSound();
      ui.toast(t);
    },
    onFail: (t) => {
      ui.failSound();
      ui.toast(t);
    },
    onPickup: () => audio.click(),
    onStoryComplete: () => {
      document.getElementById('endingText').textContent = `Twenty jobs, $100,000 repaid, and a city that knows your name: ${progression.rank().name}. The streets stay open — properties, bounties and contracts keep paying.`;
      document.getElementById('ending').classList.remove('hidden');
    },
  },
});

const phone = createPhone(progression, missions);
const hud = createHud({ progression, police, world, missions });
ui.toast = (t) => hud.toast(t);
ui.banner = (t, s) => hud.banner(t, s);
ui.marisol = (text) => {
  phone.pushMessage(text);
  hud.toast(`📱 Marisol: ${text.length > 64 ? `${text.slice(0, 64)}…` : text}`, 3.4);
};
ui.cashSound = () => audio.cash();
ui.jobSound = () => audio.jobDone();
ui.failSound = () => audio.fail();

// The player's headlight: one real spotlight that follows the current car.
const headlight = new THREE.SpotLight(0xd8ecff, 0, 55, 0.5, 0.45);
view.scene.add(headlight);
view.scene.add(headlight.target);

// ------------------------------------------------------------ debug handle
window.__game = {
  world, vehicles, player, police, progression, missions, weapons, properties, drone,
  teleport(x, z) {
    const focus = player.car ?? player;
    focus.x = x;
    focus.z = z;
    if (player.car) {
      player.car.speed = 0;
      player.car.mesh.position.set(x, 0, z);
    } else {
      player.mesh.position.set(x, 0, z);
    }
  },
  addCash(n) { progression.paySide(n); },
  setStars(n) { police.setHeat(n); },
  startStoryJob(i) {
    progression.state.storyIndex = i;
    missions.restartJob();
  },
};

// ------------------------------------------------------------ shot mode
if (shot) {
  document.getElementById('title').classList.add('hidden');
  stageShot(shot, { world, vehicles, player, police, missions, view, progression });
  let painted = 0;
  const paint = () => {
    view.render();
    painted++;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  runGame();
}

// ------------------------------------------------------------ the game
function runGame() {
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let autosave = 0;
  let phoneRefresh = 0;
  let shopOpen = false;
  let orbit = 0;

  const titleEl = document.getElementById('title');
  const hudEl = document.getElementById('hud');
  const pauseEl = document.getElementById('pause');
  const shopEl = document.getElementById('modshop');
  if (progression.hasSave()) document.getElementById('btnContinue').classList.remove('hidden');

  function announce(message) {
    status.textContent = message;
  }

  function beginPlay(continued) {
    audio.wake();
    if (continued && progression.load()) {
      for (let i = 0; i < STASHES.length; i++) world.stashMeshes[i].visible = !progression.state.stashes[i];
      missions.restartJob();
      const rec = progression.state.lastCar;
      if (rec) {
        const car = vehicles.spawnCar(rec.model, rec.x, rec.z, rec.angle, 'parked', { color: rec.color, mods: rec.mods });
        car.hp = rec.hp;
        lastDrivenCar = car;
      }
      hud.toast('Welcome back to Azul');
    }
    screen = 'play';
    titleEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    announce('Playing Neon Harbor.');
  }

  document.getElementById('btnNew').addEventListener('click', () => {
    if (progression.hasSave()) {
      progression.wipe();
      window.sessionStorage.setItem('nh-start', 'new');
      window.location.reload();
      return;
    }
    beginPlay(false);
  });
  document.getElementById('btnContinue').addEventListener('click', () => beginPlay(true));
  document.getElementById('btnFree').addEventListener('click', () => document.getElementById('ending').classList.add('hidden'));
  document.getElementById('btnResume').addEventListener('click', () => togglePause(false));
  document.getElementById('btnTitle').addEventListener('click', () => {
    togglePause(false);
    screen = 'title';
    titleEl.classList.remove('hidden');
    hudEl.classList.add('hidden');
    if (progression.hasSave()) document.getElementById('btnContinue').classList.remove('hidden');
  });
  const autoStart = window.sessionStorage.getItem('nh-start');
  if (autoStart) {
    window.sessionStorage.removeItem('nh-start');
    beginPlay(autoStart === 'continue');
  }

  function togglePause(on) {
    if (screen === 'play' && on) {
      screen = 'pause';
      pauseEl.classList.remove('hidden');
      saveNow();
    } else if (screen === 'pause' && !on) {
      screen = 'play';
      pauseEl.classList.add('hidden');
    }
  }

  function saveNow() {
    if (player.car) {
      progression.state.lastCar = {
        model: player.car.spec.id, color: player.car.color, mods: { ...player.car.mods },
        hp: player.car.hp, x: player.car.x, z: player.car.z, angle: player.car.angle,
      };
    } else if (lastDrivenCar && !lastDrivenCar.dead && lastDrivenCar.kind !== 'traffic' && vehicles.cars.includes(lastDrivenCar)) {
      progression.state.lastCar = {
        model: lastDrivenCar.spec.id, color: lastDrivenCar.color, mods: { ...lastDrivenCar.mods },
        hp: lastDrivenCar.hp, x: lastDrivenCar.x, z: lastDrivenCar.z, angle: lastDrivenCar.angle,
      };
    }
    progression.save();
  }

  function closeShop() {
    shopOpen = false;
    shopEl.classList.add('hidden');
  }
  function openShop() {
    if (!player.car) return;
    shopOpen = true;
    shopEl.classList.remove('hidden');
    refreshShop();
  }
  function refreshShop() {
    hud.renderModShop(properties.catalogue(player.car), player.car.spec.name, (row) => {
      if (properties.buyMod(player.car, row)) refreshShop();
    });
  }

  // ------------------------------------------------------------ per-frame actions
  function frameActions() {
    if (input.wasPressed('Escape')) {
      if (shopOpen) closeShop();
      else if (phone.isOpen) phone.close();
      else if (screen === 'play') togglePause(true);
      else if (screen === 'pause') togglePause(false);
      return;
    }
    if (screen !== 'play') return;
    audio.wake();
    if (input.wasPressed('KeyT')) {
      phone.toggle();
      audio.click();
      return;
    }
    if (phone.isOpen && input.wasPressed('Tab')) {
      phone.nextPage();
      audio.click();
      return;
    }
    if (input.wasPressed('KeyP')) {
      if (photoMode.active) {
        photoMode.exit();
        hud.toast('Photo mode off');
      } else if (!drone.active) {
        const focus = player.focus();
        photoMode.enter({ x: focus.x, z: focus.z, y: player.car ? player.car.y : 0 }, rig.yaw);
        hud.toast('📷 Photo mode — WASD fly, F takes the shot, P exits');
      }
      return;
    }
    if (photoMode.active) {
      if (input.wasPressed('KeyF')) {
        progression.state.stats.photos++;
        progression.save();
        hud.toast(`📷 Shot #${progression.state.stats.photos} in the career album`);
        audio.click();
      }
      return;
    }
    if (input.wasPressed('KeyG')) {
      if (drone.active) {
        drone.land();
        hud.toast('Drone landed');
      } else if (!player.car) {
        drone.launch({ x: player.x, z: player.z, angle: player.angle });
        hud.toast('🛸 Drone up — WASD + Space/Shift, F drops a photo over a POI');
      } else {
        hud.toast('Step out of the car to fly the drone');
      }
      return;
    }
    if (drone.active && input.wasPressed('KeyF')) {
      const poi = drone.takePhoto();
      if (poi) {
        progression.paySide(drone.pay, poi.district);
        progression.state.stats.dronePhotos++;
        progression.save();
        audio.cash();
        hud.toast(`🛸 Photo of ${poi.name}: +$${drone.pay}`);
      } else {
        hud.toast('No POI in frame — hover over a named place');
      }
      return;
    }
    // The weapon wheel: hold Q, pick with 1-4, release to equip.
    if (input.isDown('KeyQ') && !player.car) {
      if (!weapons.wheelOpen) {
        weapons.setWheel(true);
        hud.showWheel(weapons);
      }
      for (let i = 0; i < 4; i++) {
        if (input.wasPressed(`Digit${i + 1}`)) {
          weapons.select(i);
          hud.showWheel(weapons);
        }
      }
    } else if (weapons.wheelOpen) {
      weapons.setWheel(false);
      hud.hideWheel();
      audio.click();
    }
    if (input.wasPressed('KeyR')) weapons.reload();
    if (input.wasPressed('KeyB')) {
      const car = progression.callCrew(vehicles, player.focus());
      hud.toast(car ? '📞 Dario is rolling — he will lean on the heat for you' : `Crew unavailable (${Math.ceil(progression.crewCooldown())}s)`);
    }
    if (input.wasPressed('KeyC')) {
      const name = audio.cycleRadio();
      hud.toast(name ? `📻 ${name}` : '📻 Radio off');
    }
    if (input.wasPressed('KeyH')) {
      audio.horn();
      const focus = player.focus();
      world.setPanic(focus.x, focus.z, 6);
    }
    if (input.wasPressed('KeyU')) {
      if (missions.acceptContract()) audio.click();
      else if (missions.contract) hud.toast('A contract is already running');
    }
    if (input.wasPressed('KeyM')) {
      if (shopOpen) closeShop();
      else if (player.car && properties.inShopZone(player.focus()) && Math.abs(player.car.speed) < 1.5) openShop();
      else if (player.car) hud.toast('The mod shop is the Neon Works Garage in Centro — drive in and stop');
    }
    if (input.wasPressed('KeyY')) {
      const focus = player.focus();
      const raceDef = player.car ? missions.raceStartNear(focus) : null;
      if (raceDef && !missions.race) missions.startRace(raceDef, player.car);
      else missions.startGig();
    }
    if (input.wasPressed('KeyE')) handleInteract();
  }

  function handleInteract() {
    const focus = player.focus();
    if (player.car) {
      // Context first: storing the car in an owned garage beats stepping out.
      const prompt = properties.promptAt({ x: focus.x, z: focus.z, carRef: player.car }, true);
      if (prompt && prompt.act && prompt.text.includes('Store')) {
        prompt.act();
        return;
      }
      if (missions.race) {
        missions.cancelRace();
        hud.toast('Race abandoned');
      }
      player.exitCar();
      audio.engineOff();
      return;
    }
    const propPrompt = properties.promptAt(focus, false);
    if (propPrompt && propPrompt.act) {
      propPrompt.act();
      return;
    }
    // Nearest enterable car.
    let best = null;
    let bestDist = 3.6;
    for (const car of vehicles.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    if (best) {
      const wasTraffic = best.kind === 'traffic';
      player.enterCar(best);
      lastDrivenCar = best;
      rig.snap(best.angle);
      if (wasTraffic) {
        progression.state.stats.carjacks++;
        progression.save();
        police.reportCrime(1);
        hud.toast(`🚗 Carjacked the ${best.spec.name}! Heat is up`);
      }
    }
  }

  function currentPrompt() {
    if (shopOpen || phone.isOpen || photoMode.active) return null;
    const focus = player.focus();
    if (drone.active) return 'F — photo over a POI · G — land the drone';
    if (player.car) {
      if (properties.inShopZone(focus) && Math.abs(player.car.speed) < 1.5 && !shopOpen) return 'M — Neon Works Garage (mods)';
      const propPrompt = properties.promptAt({ x: focus.x, z: focus.z, carRef: player.car }, true);
      if (propPrompt) return `E — ${propPrompt.text}`;
      const raceDef = missions.raceStartNear(focus);
      if (raceDef && !missions.race) return `Y — Start ${raceDef.name}`;
      return 'E — step out';
    }
    const propPrompt = properties.promptAt(focus, false);
    if (propPrompt) return `E — ${propPrompt.text}`;
    let bestDist = 3.6;
    let best = null;
    for (const car of vehicles.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    if (best) return `E — ${best.kind === 'traffic' ? 'Carjack' : 'Drive'} the ${best.spec.name}`;
    return null;
  }

  // ------------------------------------------------------------ simulation step
  function step(dt) {
    const focus = player.focus();
    const env = { scene: view.scene, sun: view.sun, hemi: view.hemi, ambient: view.ambient };
    const { rainLevel } = world.update(dt, focus, env);
    vehicles.updateTraffic(dt, focus, rainLevel);
    audio.rain(rainLevel);

    if (drone.active) {
      drone.update(dt, input);
    } else if (player.car) {
      const car = player.car;
      const drive = vehicles.drivePlayer(car, input, dt, { rain: rainLevel }, {
        onNearMiss: () => progression.addStyle('nearMiss'),
        onDrift: (c, stepDt) => progression.addStyle('driftSecond', stepDt),
        onLand: (c, air) => {
          progression.addStyle('airSecond', air);
          if (air > 0.5) hud.toast(`🛫 Airtime ${air.toFixed(1)}s!`);
        },
        onWallHit: (c) => {
          if (Math.abs(c.speed) > 10) {
            progression.bustStyle();
            audio.hit();
          }
        },
        onRam: (a, b, relSpeed) => {
          if (b.kind === 'police') police.reportCrime(0.6);
          else if (b.kind === 'traffic') police.reportCrime(0.25);
          if (relSpeed > 11) {
            progression.bustStyle();
            audio.hit();
          }
        },
      });
      audio.engine(drive.throttle, drive.speedNorm);
      if (police.spikeTimer > 0) car.speed = Math.min(car.speed, 9);
      if (car.dead) {
        player.exitCar();
        audio.engineOff();
        hud.toast('💥 Your ride is wrecked. Find another.');
      }
    } else {
      player.update(dt, input, rig.yaw);
      audio.engineOff();
      // Firing on foot: mouse or F, aimed where the camera looks.
      if ((input.mouse.down || input.isDown('KeyF')) && !phone.isOpen && !weapons.wheelOpen) {
        const dir = new THREE.Vector3();
        view.camera.getWorldDirection(dir);
        weapons.tryFire({ x: player.x, y: 1.45, z: player.z }, dir, vehicles.cars, null);
      }
    }

    const focusNow = player.focus();
    police.update(dt, {
      x: focusNow.x, z: focusNow.z,
      angle: player.car ? player.car.angle : player.angle,
      inCar: !!player.car,
      carSpeed: player.car ? player.car.speed : 0,
      carDead: player.car ? player.car.dead : false,
    }, {
      onBusted: () => {
        const fine = Math.min(BUST_FINE, progression.state.sideCash);
        progression.state.sideCash -= fine;
        if (player.car) player.exitCar();
        player.x = -140;
        player.z = 222;
        progression.save();
        audio.fail();
        hud.banner('BUSTED', fine > 0 ? `Fined $${fine}. Released at the Neon Marina.` : 'Released at the Neon Marina with a warning.');
      },
      onSpike: () => hud.toast('🛞 Spikes! Your tyres are shredded — crawl to safety'),
    });
    missions.update(dt, focusNow, !!player.car, player.car);
    progression.update(dt, { onStyleBanked: (cash) => { audio.cash(); hud.toast(`✨ Style banked: +$${cash}`); } });
    progression.updateCrew(dt, vehicles, focusNow, police.cruisers, {});
    properties.update(dt);
    weapons.update(dt);

    // Stash crates.
    for (let i = 0; i < STASHES.length; i++) {
      if (progression.state.stashes[i]) continue;
      const s = STASHES[i];
      if (Math.hypot(s.x - focusNow.x, s.z - focusNow.z) < 2.8) {
        progression.state.stashes[i] = true;
        world.stashMeshes[i].visible = false;
        progression.paySide(STASH_REWARD, districtAt(s.x, s.z));
        progression.save();
        audio.cash();
        hud.toast(`💰 Stash found: +$${STASH_REWARD} (${progression.state.stashes.filter(Boolean).length}/20)`);
      }
    }

    // Headlight follows the current car after dark.
    if (player.car && world.isNight()) {
      const car = player.car;
      headlight.intensity = 700;
      headlight.position.set(car.x + Math.sin(car.angle) * 2, 1.4 + car.y, car.z + Math.cos(car.angle) * 2);
      headlight.target.position.set(car.x + Math.sin(car.angle) * 26, 0, car.z + Math.cos(car.angle) * 26);
    } else {
      headlight.intensity = 0;
    }

    // Camera: drone and photo mode drive it themselves.
    if (!drone.active) {
      const target = player.car
        ? { x: player.car.x, z: player.car.z, angle: player.car.angle, speed: player.car.speed, y: player.car.y }
        : { x: player.x, z: player.z, angle: player.angle, speed: 0, y: 0 };
      rig.update(dt, target, player.car ? 'car' : 'foot');
    }
    autosave += dt;
    if (autosave > AUTOSAVE_SECONDS) {
      autosave = 0;
      saveNow();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    frameActions();
    if (screen === 'title') {
      orbit += frameDt * 0.05;
      const env = { scene: view.scene, sun: view.sun, hemi: view.hemi, ambient: view.ambient };
      world.update(frameDt, { x: -126, z: 218 }, env);
      vehicles.updateTraffic(frameDt, { x: -126, z: 218 }, 0);
      view.camera.position.set(-126 + Math.sin(orbit) * 30, 15, 218 + Math.cos(orbit) * 30);
      view.camera.lookAt(-126, 3, 214);
    } else if (screen === 'play') {
      if (photoMode.active) {
        photoMode.update(frameDt, input);
      } else {
        accumulator += frameDt;
        while (accumulator >= STEP) {
          step(STEP);
          accumulator -= STEP;
        }
      }
      hud.setPrompt(currentPrompt());
      const focus = player.focus();
      hud.update(frameDt, {
        focus,
        focusAngle: player.car ? player.car.angle : player.angle,
        inCar: !!player.car,
        carSpeed: player.car ? player.car.speed : 0,
        rain: world.rain(),
        districtName: districtName(districtAt(focus.x, focus.z)),
        radio: audio.radioName(),
        drone: drone.active ? drone.battery : 0,
        weaponText: player.car ? player.car.spec.name : `${weapons.weapon().name} · ${weapons.ammoText()}`,
      });
      document.getElementById('crosshair').classList.toggle('hidden', !!player.car || drone.active);
      phoneRefresh += frameDt;
      if (phone.isOpen && phoneRefresh > 0.3) {
        phoneRefresh = 0;
        phone.render();
      }
    }
    view.render();
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') togglePause(true);
  });
  window.addEventListener('beforeunload', () => saveNow());
  announce('Neon Harbor: Streets of Azul. New Game or Continue.');
  requestAnimationFrame(frame);
}
