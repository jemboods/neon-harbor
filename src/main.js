// Boot and the one loop: fixed-step updates, third-person camera, player on foot
// and in cars, interactions, overlays, weapons, drone, photo mode and the
// busted/wasted sequences. Shot staging lives in shots.js.
import * as THREE from 'three';
import {
  BOUNTIES, CHAPTERS, CHARACTERS, CLINIC, CONTRACTS, DAY_LENGTH, DISTRICTS, GARAGE,
  INTERCEPTOR, MOD_SHOP, POIS, POLICE_POST, PROPERTIES, RACES, SIREN_RANGE,
  SPRINT_SPEED, STAR_HEAT, STANDING_LEVELS, STORY, STORY_PAYOUTS, VEHICLES,
  WALK_SPEED, WEAPONS, DRONE_BATTERY,
} from './config.js';
import { axes, down, hit, initInput, takeWheel } from './input.js';
import { collide, createCity, districtAt } from './world.js';
import { buildHumanoid, pose } from './people.js';
import { buildCar } from './cars.js';
import { createAudio } from './audio.js';
import { applySave, clearSave, createState, debtLeft, loadSave, rankFor, saveGame } from './state.js';
import { createHud } from './hud.js';
import { createSystems } from './systems.js';
import { stageShot } from './shots.js';

const CHAPTER_LINES = [
  'Marisol runs the dock ledger, and your name is in it for $100,000.',
  'The harbor starts to know your face. Bigger work finds you.',
  'The patrol is watching the docks now. Work clean, drive faster.',
  'One ledger page left. Settle it and the harbor is yours.',
];
const PED_LINES = [
  'Rain is coming in off the water tonight.', 'You drive for Marisol? She runs a tight dock.',
  'Watch the patrol near the police post.', 'The ferry leaves when the lamp lights. It always does.',
];

const params = new URLSearchParams(window.location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2600);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const city = createCity(scene);
const hud = createHud();
const audio = createAudio();
const S = createState();
const sys = createSystems(scene, city, hud, audio);
const savedGame = loadSave();

const hero = buildHumanoid(CHARACTERS.player);
scene.add(hero.group);
const player = { x: 20, z: 226, heading: 2.6, speed: 0, y: 0, vy: 0, car: null, walkPhase: 0, spikeT: 0, hurtT: 0 };
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffb43a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
beam.visible = false;
scene.add(beam);
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd98a });
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, tracerMat);
tracer.visible = false;
scene.add(tracer);

let mode = 'title'; // title | play
let sequence = null; // {kind, t}
let phoneOpen = false, phonePage = 0;
let helpOpen = false, helpAutoT = 0;
let modOpen = false, modSel = 0;
let wheelOpen = false, wheelSel = -1;
let photoMode = false, droneMode = false;
let drone = { x: 0, z: 0, y: 26, battery: DRONE_BATTERY };
let camYaw = 2.6, camPitch = 0.32, titleAngle = 0;
let fireT = 0, reloadT = 0, tracerT = 0, saveT = 0, lastHeat = 0, heatFreshT = 0;
let cardJob = -1, cardDismissed = false;
let camPos = new THREE.Vector3(60, 26, 330);
const PHONE_PAGES = ['Messages', 'Jobs', 'Districts', 'Properties', 'Bounties', 'Contracts', 'Career'];

const P = () => ({
  x: player.x, z: player.z, heading: player.car ? player.car.heading : player.heading,
  speed: Math.abs(player.speed), onFoot: !player.car, car: player.car,
});
const distTo = (x, z) => Math.hypot(x - player.x, z - player.z);

function startGame(cont) {
  if (cont && savedGame) {
    applySave(S, savedGame);
    if (typeof savedGame.px === 'number') { player.x = savedGame.px; player.z = savedGame.pz; }
    if (S.garageCar) hud.toast('Save loaded — the garage kept your car');
  } else if (!cont) {
    clearSave();
  }
  mode = 'play';
  S.screen = 'play';
  hud.setTitle(false, !!savedGame);
  hud.subtitle('Marisol', S.jobIndex > 0 ? 'Back to work. The ledger is waiting.' : 'You owe the harbor $100,000. Jobs start at the cantina.', 5);
  if (!S.helpSeen) { setHelp(true); helpAutoT = 15; }
  audio.unlock();
}
function setHelp(on) {
  helpOpen = on;
  hud.show('help', on);
  if (!on) { S.helpSeen = true; helpAutoT = 0; }
}
function setPhone(on) {
  phoneOpen = on;
  if (on) renderPhone();
  else hud.phone(false);
}
function renderPhone() {
  const rows = [];
  let title = 'Phone';
  if (phonePage === 0) {
    title = 'Messages';
    rows.push(...sys.messages.slice(-9).map((m) => `<div class="msg"><b>${m.from}</b> — ${m.text}</div>`));
  } else if (phonePage === 1) {
    title = 'Jobs — the ledger';
    STORY.forEach((j, i) => {
      const done = i < S.jobIndex, next = i === S.jobIndex;
      rows.push(`<div class="row ${done || !next ? 'dim' : ''}"><span>${i + 1}. ${j[0]}</span><span>${done ? 'paid' : '$' + STORY_PAYOUTS[i].toLocaleString('en-US')}</span></div>`);
    });
    rows.push(`<div class="row"><span>Debt left</span><span>$${debtLeft(S).toLocaleString('en-US')}</span></div>`);
  } else if (phonePage === 2) {
    title = 'District standings';
    DISTRICTS.forEach((d, i) => rows.push(`<div class="row"><span>${d.name}</span><span>${STANDING_LEVELS[Math.min(4, Math.floor((S.standing[i] || 0) / 60))]}</span></div>`));
  } else if (phonePage === 3) {
    title = 'Properties';
    PROPERTIES.forEach((p, i) => rows.push(`<div class="row"><span>${p.name}</span><span>${S.properties[i] ? `yours — rent $${p.rent}/min` : '$' + p.price.toLocaleString('en-US')}</span></div>`));
    rows.push(`<div class="row"><span>Harbor garage</span><span>${S.garageCar ? S.garageCar.name + ' stored' : 'empty'}</span></div>`);
  } else if (phonePage === 4) {
    title = 'Bounty board';
    rows.push('<div class="dim">Wreck or pin the named car in its district. The board pays on the spot.</div>');
    BOUNTIES.forEach((b) => rows.push(`<div class="row"><span>${b[0]} — ${DISTRICTS[b[2]].name}</span><span>$${b[3].toLocaleString('en-US')}</span></div>`));
  } else if (phonePage === 5) {
    title = 'Getaway contracts';
    rows.push('<div class="dim">Press U in the street to take the next contract. Early and clean pays a bonus.</div>');
    CONTRACTS.forEach((c) => rows.push(`<div class="row"><span>${c[0]}</span><span>$${c[5]} — cap ${c[4]} star${c[4] > 1 ? 's' : ''}</span></div>`));
  } else {
    title = 'Career';
    rows.push(`<div class="row"><span>Respect</span><span>${rankFor(S.lifetime)}</span></div>`);
    rows.push(`<div class="row"><span>Lifetime earnings</span><span>$${S.lifetime.toLocaleString('en-US')}</span></div>`);
    rows.push(`<div class="row"><span>Story jobs done</span><span>${S.jobsDone} of 20</span></div>`);
    rows.push(`<div class="row"><span>Carjacks</span><span>${S.carjacks}</span></div>`);
    rows.push(`<div class="row"><span>Photos / drops</span><span>${S.photos} / ${S.photoDrops}</span></div>`);
    rows.push(`<div class="row"><span>Stashes found</span><span>${S.stashesTaken.length} of 20</span></div>`);
  }
  hud.phone(true, phonePage, PHONE_PAGES, title, rows.join(''));
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  car.role = 'parked';
  car.speed = 0;
  player.car = null;
  player.x = car.x - Math.cos(car.heading) * 2.4;
  player.z = car.z + Math.sin(car.heading) * 2.4;
  player.heading = car.heading;
  hero.group.visible = true;
}
function enterCar(car) {
  if (car.role === 'traffic') { // carjacking a driven car
    S.carjacks++;
    sys.addHeat(S, 6);
    hud.toast('Carjacked — the driver will report that');
  }
  if (car.model === INTERCEPTOR) {
    if (S.heat < STAR_HEAT[1]) sys.addHeat(S, STAR_HEAT[1] - S.heat + 1);
    hud.toast('That is a patrol Interceptor — heat is on you');
  }
  car.role = 'player';
  player.car = car;
  player.speed = 0;
  hero.group.visible = false;
  hud.prompt(null);
}
function startSequence(kind) {
  if (sequence) return;
  const wasCar = player.car;
  if (player.car) exitCar(); // wasted/busted while driving ejects first
  sequence = { kind, t: 0, fined: false, car: wasCar };
  S.screen = 'over';
  droneMode = false;
  hud.show('photoUi', false);
  photoMode = false;
  if (kind === 'busted') {
    hud.slam('busted', 'busted', '');
    audio.sting('busted');
  } else {
    hud.slam('wasted', 'wasted', '');
    audio.sting('wasted');
  }
  audio.slam();
}
function finishSequence() {
  const kind = sequence.kind;
  const seqCar = sequence.car;
  sequence = null;
  S.screen = 'play';
  hud.hideSlam();
  hud.fade(false);
  S.health = 100;
  sys.standDown(S);
  if (kind === 'busted') {
    const fine = Math.min(S.cash, Math.max(250, Math.round(S.cash * 0.1)));
    S.cash -= fine;
    if (seqCar && seqCar.yours) { // an owned car goes back to the garage, not the pound
      S.garageCar = { model: seqCar.model, color: seqCar.color, mods: { ...seqCar.mods }, name: VEHICLES[seqCar.model].name };
      sys.removeCar(seqCar);
    }
    player.x = POIS[POLICE_POST].x + 4; player.z = POIS[POLICE_POST].z + 6;
    sys.failJob(S, 'The patrol took you in.');
    hud.subtitle('', `The harbor patrol impounded your ride and took $${fine.toLocaleString('en-US')}.`, 5);
  } else {
    const fee = Math.min(S.cash, 500);
    S.cash -= fee;
    player.x = POIS[CLINIC].x + 4; player.z = POIS[CLINIC].z + 6;
    sys.failJob(S, 'You woke up at the clinic.');
    hud.subtitle('', 'Playa Este clinic patched you up — $500.', 5);
  }
  player.heading = 0;
  setHelp(true); // the help overlay reopens after every respawn
  helpAutoT = 15;
  saveGame(S, { px: player.x, pz: player.z });
}
function updateSequence(dt) {
  sequence.t += dt;
  if (sequence.t > 1.5 && !sequence.fined) { sequence.fined = true; hud.fade(true); }
  if (sequence.t > 2.3) finishSequence();
}

function addCombo(kind, base) {
  const c = S.combo;
  c.score += Math.round(base * c.mult);
  c.timer = 6;
  c.mult = Math.min(5, c.mult + 0.5);
  if (kind) hud.toast(kind);
}
function updateCombo(dt) {
  const c = S.combo;
  if (c.timer > 0) {
    c.timer -= dt;
    if (c.timer <= 0 && c.score > 0) {
      S.cash += c.score;
      S.lifetime += c.score;
      hud.toast(`Style banked — +$${c.score}`);
      audio.cash();
      c.score = 0; c.mult = 1;
    }
  }
}

function tryFire() {
  const wi = S.weapon;
  if (wi < 0 || reloadT > 0 || fireT > 0) return;
  const w = WEAPONS[wi], st = S.weapons[wi];
  if (st.mag <= 0) { reloadWeapon(); return; }
  st.mag--;
  fireT = w.rate;
  audio.shot();
  sys.addHeat(S, 3);
  // Hitscan along the camera's forward line from the player; vehicles only.
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3(player.x, 1.4, player.z);
  let best = null, bestD = w.range;
  for (const car of sys.cars) {
    if (car === player.car) continue;
    const to = new THREE.Vector3(car.x - origin.x, 0.6, car.z - origin.z);
    const d = to.length();
    if (d > w.range) continue;
    to.normalize();
    if (to.dot(dir) > 0.996 && d < bestD) { best = car; bestD = d; }
  }
  const end = best
    ? new THREE.Vector3(best.x, 0.8, best.z)
    : origin.clone().add(dir.clone().multiplyScalar(w.range));
  const pos = tracer.geometry.attributes.position;
  pos.setXYZ(0, origin.x, 1.35, origin.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  tracer.visible = true;
  tracerT = 0.06;
  if (best) {
    sys.damageCar(best, w.damage);
    if (best.role === 'bounty') hud.toast('Target hit — wreck or pin it');
  }
}
function reloadWeapon() {
  const wi = S.weapon;
  if (wi < 0 || reloadT > 0) return;
  const w = WEAPONS[wi], st = S.weapons[wi];
  if (st.mag >= w.mag || st.reserve <= 0) return;
  reloadT = w.reload;
  audio.reload();
}
function finishReload() {
  const wi = S.weapon;
  if (wi < 0) return;
  const w = WEAPONS[wi], st = S.weapons[wi];
  const take = Math.min(w.mag - st.mag, st.reserve);
  st.mag += take; st.reserve -= take;
}

const MOD_DEFS = [
  { name: 'Paint', price: (car) => 500, label: (car) => 'Paint — next colour' },
  { name: 'Neon underglow', price: () => 800, label: (car) => car.mods.neon ? 'Neon underglow — fitted' : 'Neon underglow' },
  { name: 'Grip tier', price: (car) => 1200 * (car.mods.grip + 1), label: (car) => `Grip — tier ${car.mods.grip} of 3` },
  { name: 'Turbo tier', price: (car) => 1500 * (car.mods.turbo + 1), label: (car) => `Turbo — tier ${car.mods.turbo} of 3` },
  { name: 'Armor tier', price: (car) => 1300 * (car.mods.armor + 1), label: (car) => `Armor — tier ${car.mods.armor} of 3` },
];
function modLines(car) {
  return MOD_DEFS.map((d, i) => {
    const maxed = (i === 2 && car.mods.grip >= 3) || (i === 3 && car.mods.turbo >= 3) || (i === 4 && car.mods.armor >= 3) || (i === 1 && car.mods.neon);
    return [d.label(car), maxed ? 'done' : '$' + d.price(car).toLocaleString('en-US')];
  });
}
function buyMod(car, i) {
  const d = MOD_DEFS[i];
  const price = d.price(car);
  const maxed = (i === 2 && car.mods.grip >= 3) || (i === 3 && car.mods.turbo >= 3) || (i === 4 && car.mods.armor >= 3) || (i === 1 && car.mods.neon);
  if (maxed) { hud.toast('Already fitted'); return; }
  if (S.cash < price) { hud.toast('Not enough side cash — gigs pay today'); return; }
  S.cash -= price;
  if (i === 0) {
    const colors = VEHICLES[car.model].colors;
    car.color = colors[(colors.indexOf(car.color) + 1) % colors.length];
    scene.remove(car.view.group);
    car.view = buildCar(car.model, car.color, car.model === INTERCEPTOR);
    car.view.group.position.set(car.x, 0, car.z);
    car.view.group.rotation.y = car.heading - Math.PI / 2;
    car.view.glow.visible = car.mods.neon;
    scene.add(car.view.group);
    hud.toast('Painted');
  } else if (i === 1) { car.mods.neon = true; car.view.glow.visible = true; hud.toast('Neon fitted'); }
  else if (i === 2) { car.mods.grip++; hud.toast('Grip tier ' + car.mods.grip); }
  else if (i === 3) { car.mods.turbo++; hud.toast('Turbo tier ' + car.mods.turbo); }
  else { car.mods.armor++; hud.toast('Armor tier ' + car.mods.armor); }
  car.yours = true;
  audio.cash();
}

function nearestCar(range) {
  let best = null, bd = range;
  for (const car of sys.cars) {
    if (car.role === 'cop' || car.role === 'crew' || car.dead) continue;
    const d = distTo(car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function computePrompt() {
  if (mode !== 'play' || sequence || phoneOpen || modOpen) return null;
  if (sys.mission.offerAt && !sys.mission.active) return null; // the job card speaks for itself
  if (player.car) {
    if (Math.abs(player.car.speed) < 3) return 'E — Step out';
    return null;
  }
  const car = nearestCar(7);
  if (car) return `E — Drive the ${VEHICLES[car.model].name}`;
  for (let i = 0; i < PROPERTIES.length; i++) {
    const p = PROPERTIES[i];
    if (distTo(p.x, p.z) < 6) return S.properties[i] ? `Your ${p.name}` : `E — Buy the ${p.name} — $${p.price.toLocaleString('en-US')}`;
  }
  if (distTo(POIS[GARAGE].x, POIS[GARAGE].z) < 8) {
    return S.garageCar ? `E — Take out the ${S.garageCar.name}` : 'The garage is empty — drive a car in';
  }
  if (sys.gig.offer && distTo(sys.gig.offer.x, sys.gig.offer.z) < 12) return `Y — Take the gig`;
  for (const ped of sys.peds) {
    if (ped.role === 'walker' && Math.hypot(ped.x - player.x, ped.z - player.z) < 3.6) return 'E — Talk';
  }
  return null;
}
function interact() {
  if (player.car) { exitCar(); return; }
  const car = nearestCar(7);
  if (car) { enterCar(car); return; }
  for (let i = 0; i < PROPERTIES.length; i++) {
    const p = PROPERTIES[i];
    if (distTo(p.x, p.z) < 6 && !S.properties[i]) {
      if (S.cash >= p.price) {
        S.cash -= p.price; S.properties[i] = true;
        hud.toast(`${p.name} is yours — rent lands every minute`);
        audio.cash(); saveGame(S, { px: player.x, pz: player.z });
      } else hud.subtitle('', 'Not enough side cash — gigs and stashes pay today.');
      return;
    }
  }
  if (distTo(POIS[GARAGE].x, POIS[GARAGE].z) < 8 && S.garageCar) {
    const g = S.garageCar;
    const c = sys.spawnCar(g.model, g.color, POIS[GARAGE].x + 5, POIS[GARAGE].z, 1.6, 'parked');
    c.mods = { ...g.mods }; c.yours = true; c.view.glow.visible = g.mods.neon;
    S.garageCar = null;
    hud.toast(`${g.name} out of the garage`);
    return;
  }
  for (const ped of sys.peds) {
    if (ped.role === 'walker' && Math.hypot(ped.x - player.x, ped.z - player.z) < 3.6) {
      hud.subtitle('Neighbor', PED_LINES[Math.floor(Math.random() * PED_LINES.length)]);
      return;
    }
  }
}
function storeCarInGarage() {
  const car = player.car;
  if (!car) return;
  S.garageCar = { model: car.model, color: car.color, mods: { ...car.mods }, name: VEHICLES[car.model].name };
  exitCar();
  sys.removeCar(car);
  hud.toast(`${VEHICLES[car.model].name} stored in the garage`);
  saveGame(S, { px: player.x, pz: player.z });
}

function movePlayer(dt) {
  const ax = axes();
  if (player.car) {
    const car = player.car;
    const spec = VEHICLES[car.model];
    const spikeF = player.spikeT > 0 ? 0.35 : 1;
    const top = spec.speed * (1 + car.mods.turbo * 0.1) * spikeF * (sys.weather.raining ? 0.94 : 1);
    const throttle = ax.z;
    const accel = spec.accel * (1 + car.mods.turbo * 0.12);
    if (throttle > 0) car.speed += accel * dt * (1 - Math.max(0, car.speed) / (top * 1.15));
    else if (throttle < 0) car.speed -= (car.speed > 0.5 ? 24 : accel * 0.7) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4.5 * dt);
    car.speed = THREE.MathUtils.clamp(car.speed, -top * 0.36, top);
    const steerIn = ax.x * (down('ShiftLeft') || down('ShiftRight') ? 1.25 : 1);
    const sf = THREE.MathUtils.clamp(Math.abs(car.speed) / 9, 0, 1) * Math.sign(car.speed || 1);
    car.heading -= steerIn * 1.55 * (1 + car.mods.grip * 0.07) * sf * dt * (car.speed < 0 ? -1 : 1);
    if (down('Space')) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 20 * dt);
    // ramps: a fast run at a ramp launches the car
    if (player.y === 0) for (const r of city.ramps) {
      if (Math.hypot(r.x - car.x, r.z - car.z) < 6 && Math.abs(car.speed) > 15) { player.vy = 6.4; break; }
    }
    player.y += player.vy * dt;
    if (player.y > 0 || player.vy > 0) {
      player.vy -= 15 * dt;
      if (player.y <= 0) {
        player.y = 0; player.vy = 0;
        if (player.airT > 0.45) addCombo('Airtime', 60);
        player.airT = 0;
      } else player.airT = (player.airT || 0) + dt;
    }
    const stepLen = car.speed * dt;
    car.x += Math.sin(car.heading) * stepLen;
    car.z += Math.cos(car.heading) * stepLen;
    const fixed = collide(city.colliders, car.x, car.z, 1.8);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      if (Math.abs(car.speed) > 13) { S.health -= (Math.abs(car.speed) - 11); player.hurtT = 6; hud.toast('Hard hit'); }
      car.speed *= 0.4;
    }
    car.x = fixed.x; car.z = fixed.z;
    car.view.group.position.set(car.x, player.y, car.z);
    car.view.group.rotation.y = car.heading - Math.PI / 2;
    car.view.group.rotation.z = player.y > 0 ? -Math.min(0.3, player.y * 0.04) : 0;
    car.view.update(Math.abs(stepLen), performance.now() / 1000, false);
    player.x = car.x; player.z = car.z;
    player.speed = car.speed;
    player.heading = car.heading;
    // style: drifting and near misses
    if ((down('ShiftLeft') || down('ShiftRight')) && Math.abs(ax.x) > 0 && Math.abs(car.speed) > 13) {
      player.driftT = (player.driftT || 0) + dt;
      if (player.driftT > 1.1) { addCombo('Drift', 40); player.driftT = 0; }
    }
    for (const other of sys.cars) {
      if (other === car || other.role === 'cop') continue;
      const d = Math.hypot(other.x - car.x, other.z - car.z);
      if (d < 4.6 && d > 2.2 && Math.abs(car.speed) > 17 && !other.nearMissCd) {
        other.nearMissCd = 4;
        addCombo('Near miss', 30);
      }
      if (other.nearMissCd) other.nearMissCd = Math.max(0, other.nearMissCd - dt);
    }
    audio.setEngine(true, Math.abs(car.speed) / spec.speed, throttle > 0 ? 1 : 0.25);
    return;
  }
  audio.setEngine(false, 0, 0);
  const sprint = down('ShiftLeft') || down('ShiftRight');
  const spd = sprint ? SPRINT_SPEED : WALK_SPEED;
  let mx = 0, mz = 0;
  if (ax.x || ax.z) {
    // Camera facing is (sin camYaw, cos camYaw); right of facing is (-cos, sin).
    const len = Math.hypot(ax.x, ax.z);
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    mx = (ax.z * sin - ax.x * cos) / len;
    mz = (ax.z * cos + ax.x * sin) / len;
    player.heading = Math.atan2(mx, mz);
  }
  const moving = !!(ax.x || ax.z);
  player.speed = moving ? spd : 0;
  player.x += mx * spd * dt;
  player.z += mz * spd * dt;
  if (hit('Space') && player.y === 0) player.vy = 4.4;
  player.y += player.vy * dt;
  if (player.y > 0 || player.vy > 0) { player.vy -= 13 * dt; if (player.y <= 0) { player.y = 0; player.vy = 0; } }
  const fixed = collide(city.colliders, player.x, player.z, 0.5);
  player.x = fixed.x; player.z = fixed.z;
  player.walkPhase += (moving ? spd : 0) * dt * 1.7;
  hero.group.position.set(player.x, player.y, player.z);
  hero.group.rotation.y = player.heading;
  pose(hero, player.walkPhase, moving, performance.now() / 1000);
}

function updateCamera(dt) {
  if (mode === 'title') {
    titleAngle += dt * 0.05;
    const cx = 30 + Math.sin(titleAngle) * 46, cz = 566 + Math.cos(titleAngle) * 18;
    camPos.lerp(new THREE.Vector3(cx, 23, cz), 0.04);
    camera.position.copy(camPos);
    camera.lookAt(-20, 9, 360);
    return;
  }
  if (photoMode) {
    camera.position.copy(camPos);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(camYaw);
    camera.rotateX(camPitch);
    return;
  }
  if (droneMode) {
    camera.position.set(drone.x, drone.y, drone.z);
    camera.lookAt(drone.x + Math.sin(camYaw) * 20, 0, drone.z + Math.cos(camYaw) * 20);
    return;
  }
  const target = player.car
    ? new THREE.Vector3(player.x - Math.sin(player.heading) * 12.5, 6.4 + player.y, player.z - Math.cos(player.heading) * 12.5)
    : new THREE.Vector3(player.x - Math.sin(camYaw) * 8.5, 3.4 + player.y, player.z - Math.cos(camYaw) * 8.5);
  camPos.lerp(target, 1 - Math.pow(0.0001, dt));
  const clear = collide(city.colliders, camPos.x, camPos.z, 0.7); // keep the camera out of the walls
  camPos.x = clear.x; camPos.z = clear.z;
  camera.position.copy(camPos);
  camera.lookAt(player.x + Math.sin(player.car ? player.heading : camYaw) * 6, 1.6 + player.y, player.z + Math.cos(player.car ? player.heading : camYaw) * 6);
}

function paintHud(dt, res) {
  hud.update(dt, {
    state: S, hour: S.hour, debtLeft: debtLeft(S),
    driving: !!player.car, speedKmh: Math.abs(player.speed) * 3.6,
    heatFresh: heatFreshT > 0,
  });
  const obj = mode === 'play' ? sys.objective() : null;
  if (obj) {
    const d = obj.x !== null ? Math.round(Math.hypot(obj.x - player.x, obj.z - player.z)) : null;
    hud.objective(obj.label, d !== null ? `${obj.text} — ${d} m` : obj.text);
    if (obj.x !== null) {
      beam.visible = true;
      beam.position.set(obj.x, 30, obj.z);
    } else beam.visible = false;
  } else {
    hud.objective('', null);
    beam.visible = false;
  }
  hud.drawRadar({
    px: player.x, pz: player.z,
    fx: Math.sin(player.car ? player.heading : camYaw), fz: Math.cos(player.car ? player.heading : camYaw),
    markers: sys.markers(P(), S), range: 240,
  });
  if (res) audio.setSiren(S.stars > 0 && res.nearestCop < SIREN_RANGE, 1 - Math.max(0, res.nearestCop) / SIREN_RANGE, performance.now() / 1000);
}

let lastDistrict = -1;
function step(dt) {
  S.hour = (S.hour + (dt * 24) / DAY_LENGTH) % 24;
  if (sequence) { updateSequence(dt); return; }
  const modal = phoneOpen || modOpen || wheelOpen || photoMode || droneMode;
  if (!modal) movePlayer(dt);
  if (hit('KeyH')) setHelp(!helpOpen);
  if (helpAutoT > 0) { helpAutoT -= dt; if (helpAutoT <= 0 && helpOpen) setHelp(false); }
  // job card flow (Fix 2): the card waits for Enter before the job starts
  if (mode === 'play' && !sys.mission.active && S.jobIndex < STORY.length) {
    if (sys.mission.offerAt) {
      if (cardJob !== S.jobIndex) {
        cardJob = S.jobIndex; cardDismissed = false;
        const j = STORY[S.jobIndex];
        hud.jobCard({ title: j[0], text: j[1], pay: STORY_PAYOUTS[S.jobIndex] });
      }
      if (!cardDismissed) {
        if (hit('Enter')) { sys.acceptJob(S); cardJob = -1; }
        else if (hit('Escape')) { hud.jobCard(null); cardDismissed = true; }
      }
    } else if (cardJob !== -1) { hud.jobCard(null); cardJob = -1; }
  }
  if (phoneOpen) {
    if (hit('KeyT') || hit('Escape')) setPhone(false);
    else if (hit('Tab') || hit('ArrowRight')) { phonePage = (phonePage + 1) % PHONE_PAGES.length; renderPhone(); }
    else if (hit('ArrowLeft')) { phonePage = (phonePage + PHONE_PAGES.length - 1) % PHONE_PAGES.length; renderPhone(); }
  } else if (modOpen) {
    const car = player.car;
    if (hit('KeyM') || hit('Escape')) { modOpen = false; hud.modMenu(null); }
    else if (car) {
      if (hit('ArrowUp') || hit('KeyW')) modSel = (modSel + MOD_DEFS.length - 1) % MOD_DEFS.length;
      if (hit('ArrowDown') || hit('KeyS')) modSel = (modSel + 1) % MOD_DEFS.length;
      if (hit('Enter')) buyMod(car, modSel);
      hud.modMenu(modLines(car), modSel);
    }
  } else if (mode === 'play') {
    if (hit('KeyT')) setPhone(true);
    if (hit('KeyE')) {
      if (player.car) {
        let raced = false;
        for (let i = 0; i < RACES.length; i++) {
          if (!sys.race.active && distTo(RACES[i].x, RACES[i].z) < 13) { sys.startRace(i); raced = true; break; }
        }
        if (!raced) {
          if (distTo(POIS[GARAGE].x, POIS[GARAGE].z) < 9) storeCarInGarage();
          else exitCar();
        }
      } else interact();
    }
    if (hit('KeyY') && sys.gig.offer && distTo(sys.gig.offer.x, sys.gig.offer.z) < 14) {
      const o = sys.gig.offer;
      sys.gig.active = { ...o, phase: 0, timer: 150 };
      sys.gig.offer = null;
      hud.subtitle('Dispatch', o.kind === 'taxi' ? 'Fare waiting. Pick them up.' : 'Package waiting. Pick it up.');
    }
    if (hit('KeyU')) {
      if (!sys.acceptContract(S)) hud.toast('A contract is already running');
    }
    if (hit('KeyB')) { if (!sys.callCrew(P())) hud.toast('Dario is not free right now'); }
    if (hit('KeyC')) {
      const order = [-1, 0, 1, 2];
      const cur = order.indexOf(sys.__radio ?? -1);
      const next = order[(cur + 1) % order.length];
      sys.__radio = next;
      audio.setRadio(next);
      hud.toast(next < 0 ? 'Radio off' : `Radio — ${['Rádio Farol', 'Ondas do Sul', 'Noite FM'][next]}`);
    }
    if (hit('KeyV')) audio.horn();
    if (hit('KeyR')) reloadWeapon();
    if (hit('KeyG')) {
      droneMode = !droneMode;
      if (droneMode) { drone.x = player.x; drone.z = player.z; drone.y = 26; drone.battery = DRONE_BATTERY; hud.toast('Drone up — F drops a photo over a named place'); }
      else hud.toast('Drone back');
    }
    if (hit('KeyP')) {
      photoMode = !photoMode;
      hud.show('photoUi', photoMode);
      if (photoMode) { camPos.copy(camera.position); camYaw = player.heading; camPitch = -0.1; }
    }
    if (hit('KeyM') && player.car && distTo(POIS[MOD_SHOP].x, POIS[MOD_SHOP].z) < 18) {
      modOpen = true; modSel = 0;
      hud.modMenu(modLines(player.car), modSel);
    }
  }
  // weapon wheel
  if (down('KeyQ') && mode === 'play' && !phoneOpen) {
    if (!wheelOpen) { wheelOpen = true; wheelSel = S.weapon; }
    const d = takeWheel();
    if (d) wheelSel = ((wheelSel + d + 1 + WEAPONS.length + 1) % (WEAPONS.length + 1)) - 1;
    if (hit('Digit1')) wheelSel = 0;
    if (hit('Digit2')) wheelSel = 1;
    if (hit('Digit3')) wheelSel = 2;
    if (hit('Digit4')) wheelSel = -1;
    hud.wheel(true, wheelSel, S.weapons);
  } else if (wheelOpen) {
    wheelOpen = false;
    S.weapon = wheelSel;
    hud.wheel(false);
  }
  if (hit('Mouse0') && mode === 'play' && !phoneOpen && !modOpen && !wheelOpen && !photoMode && !droneMode) tryFire();
  if (photoMode) {
    const sp = down('ShiftLeft') ? 26 : 11;
    const ax2 = axes();
    camPos.x += (Math.sin(camYaw) * ax2.z - Math.cos(camYaw) * ax2.x) * sp * dt;
    camPos.z += (Math.cos(camYaw) * ax2.z + Math.sin(camYaw) * ax2.x) * sp * dt;
    if (down('Space')) camPos.y += 9 * dt;
    if (down('KeyC')) camPos.y -= 9 * dt;
    camPos.y = THREE.MathUtils.clamp(camPos.y, 1, 90);
    if (hit('KeyF')) { S.photos++; hud.centerMsg('Photo saved', 1.2); audio.text(); }
  }
  if (droneMode) {
    drone.battery -= dt;
    const ax2 = axes();
    drone.x += (Math.sin(camYaw) * ax2.z - Math.cos(camYaw) * ax2.x) * 22 * dt;
    drone.z += (Math.cos(camYaw) * ax2.z + Math.sin(camYaw) * ax2.x) * 22 * dt;
    drone.y = THREE.MathUtils.clamp(drone.y + (down('Space') ? 10 : 0) * dt - (down('ShiftLeft') ? 10 : 0) * dt, 8, 70);
    camYaw = player.heading;
    if (hit('KeyF')) { if (sys.photoDrop(S, drone.x, drone.z)) audio.cash(); else hud.toast('No named place below — fly over a marker'); }
    if (drone.battery <= 0) { droneMode = false; hud.toast('Drone battery flat — it lands itself'); }
  }
  fireT = Math.max(0, fireT - dt);
  if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) finishReload(); }
  if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0) tracer.visible = false; }
  player.spikeT = Math.max(0, player.spikeT - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.hurtT <= 0 && S.health < 100 && mode === 'play') S.health = Math.min(100, S.health + 2.2 * dt);
  const prevStars = S.stars;
  const res = sys.update(dt, S, P());
  for (const ev of sys.events.splice(0)) {
    if (ev.k === 'busted') startSequence('busted');
    else if (ev.k === 'passed') {
      hud.slam('passed', 'mission passed', `+ $${ev.pay.toLocaleString('en-US')}`);
      audio.sting('passed'); audio.cash();
      setTimeout(() => hud.hideSlam(), 2400);
      saveGame(S, { px: player.x, pz: player.z });
    } else if (ev.k === 'chapter') {
      hud.chapter(CHAPTERS[ev.idx], CHAPTER_LINES[ev.idx]);
    } else if (ev.k === 'cash') { hud.toast(`${ev.label} — +$${ev.amount}`); audio.cash(); }
    else if (ev.k === 'crash' && ev.power > 15) { S.health -= (ev.power - 13) * 1.1; player.hurtT = 6; audio.slam(); }
    else if (ev.k === 'spiked' && player.spikeT <= 0) { player.spikeT = 8; hud.toast('Spikes — tires shredded, top speed cut'); }
  }
  if (S.heat > lastHeat) heatFreshT = 2.5;
  lastHeat = S.heat;
  heatFreshT = Math.max(0, heatFreshT - dt);
  if (prevStars !== S.stars && S.stars > prevStars) audio.sting('level');
  if (S.health <= 0 && mode === 'play') startSequence('wasted');
  const dNow = districtAt(player.x, player.z);
  if (dNow !== lastDistrict) {
    if (lastDistrict !== -1 && mode === 'play') hud.zone(DISTRICTS[dNow].name);
    lastDistrict = dNow;
  }
  hud.prompt(computePrompt());
  // garage store prompt while in a car at the garage
  if (player.car && distTo(POIS[GARAGE].x, POIS[GARAGE].z) < 9) hud.prompt('E — Store the car in the garage');
  city.update(S.hour, performance.now() / 1000);
  city.setRain(sys.weather.raining, player.x, player.z, dt);
  audio.setRain(sys.weather.raining);
  audio.update(dt);
  for (const car of sys.cars) car.view.setHeadlights(city.night);
  saveT += dt;
  if (saveT > 25 && mode === 'play') { saveT = 0; saveGame(S, { px: player.x, pz: player.z }); }
  paintHud(dt, res);
}

// Mouse drag look (photo mode and on-foot camera yaw).
let dragging = false, lastMX = 0, lastMY = 0;
window.addEventListener('mousedown', (e) => { dragging = true; lastMX = e.clientX; lastMY = e.clientY; audio.unlock(); });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  lastMX = e.clientX; lastMY = e.clientY;
  if (photoMode) { camYaw -= dx * 0.005; camPitch = THREE.MathUtils.clamp(camPitch - dy * 0.005, -1.2, 1.2); }
  else if (!player.car && mode === 'play') camYaw -= dx * 0.005;
});
hud.el.btnNew.addEventListener('click', () => startGame(false));
hud.el.btnContinue.addEventListener('click', () => startGame(true));
hud.el.phoneTabs.addEventListener('click', (e) => {
  const p = e.target.dataset?.page;
  if (p !== undefined) { phonePage = Number(p); renderPhone(); }
});
window.addEventListener('keydown', (e) => {
  if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame(!!savedGame);
});

// Test and staging hook: the headless verifier drives the real game through this.
window.__nh = {
  S, sys, player, hud, scene, camera,
  start: (cont) => startGame(cont),
  teleport: (x, z) => { player.x = x; player.z = z; if (player.car) { player.car.x = x; player.car.z = z; } },
  heat: (n) => sys.addHeat(S, n),
  setBust: (v) => { S.bust = v; },
  health: (v) => { S.health = v; if (v <= 0) player.hurtT = 6; }, // hurt pause, like real damage, so the sequence check sees it
  acceptJob: () => sys.acceptJob(S),
  offerAt: () => !!sys.mission.offerAt,
  objective: () => sys.objective(),
  enterNearest: () => { const c = nearestCar(30); if (c) { player.x = c.x + 2; player.z = c.z; enterCar(c); } return !!c; },
  exitCar: () => exitCar(),
  fire: () => { S.weapon = S.weapon < 0 ? 0 : S.weapon; tryFire(); },
  setWeapon: (i) => { S.weapon = i; },
  drone: () => { droneMode = !droneMode; if (droneMode) { drone.x = player.x; drone.z = player.z; } return droneMode; },
  photoDrop: () => sys.photoDrop(S, player.x, player.z),
  crew: () => sys.callCrew(P()),
  contract: () => sys.acceptContract(S),
  gigOffer: () => sys.gig.offer,
  takeGig: () => { if (sys.gig.offer) { sys.gig.active = { ...sys.gig.offer, phase: 0, timer: 150 }; sys.gig.offer = null; return true; } return false; },
  race: (i) => sys.startRace(i),
  phone: (page) => { if (page !== undefined) phonePage = page; setPhone(true); },
  closePhone: () => setPhone(false),
  help: (on) => setHelp(on),
  helpOpen: () => helpOpen,
  modshop: () => { if (player.car) { modOpen = true; hud.modMenu(modLines(player.car), 0); } },
  buyMod: (i) => { if (player.car) buyMod(player.car, i); },
  buyProperty: (i) => { if (S.cash >= PROPERTIES[i].price && !S.properties[i]) { S.cash -= PROPERTIES[i].price; S.properties[i] = true; return true; } return false; },
  storeCar: () => storeCarInGarage(),
  setHour: (h) => { S.hour = h; },
  sequence: () => sequence?.kind ?? null,
  cops: () => sys.cars.filter((c) => c.role === 'cop').map((c) => ({ x: c.x, z: c.z, d: Math.hypot(c.x - player.x, c.z - player.z) })),
  nearestCopDist: () => Math.min(1e9, ...sys.cars.filter((c) => c.role === 'cop').map((c) => Math.hypot(c.x - player.x, c.z - player.z))),
  markers: () => sys.markers(P(), S),
  save: () => saveGame(S, { px: player.x, pz: player.z }),
  mode: () => mode,
};

async function boot() {
  initInput();
  try { await document.fonts.ready; } catch { /* fall back to system fonts */ }
  const shot = params.get('shot');
  if (shot) {
    stageShot(shot, {
      S, sys, player, hud, scene, camera, renderer, city, hero, startGame, enterCar, nearestCar, paintHud,
      openPhone: (p) => { phonePage = p; setPhone(true); },
      closeHelp: () => setHelp(false),
    });
    return;
  }
  hud.setTitle(true, !!savedGame);
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (acc >= 1 / 60) {
      if (mode === 'play') step(1 / 60);
      else city.update(S.hour, now / 1000);
      acc -= 1 / 60;
    }
    updateCamera(1 / 60);
    if (mode === 'title') paintHud(0, null);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
boot();
