// Missions: the 20-job story engine (goto, deliver, chase, escape,
// collect, timerun) plus the free-roam stack that shares its marker —
// taxi/courier gigs, two street races against three AI rivals, the
// bounty board and the getaway contracts. Story payouts go through
// payStory only; everything here that pays cash on the side uses paySide.

import * as THREE from 'three';
import {
  BOUNTIES, BOUNTY_PIN_SECONDS, BOUNTY_RESPAWN_SECONDS, CONTRACTS, CONTRACT_EARLY_BONUS,
  GIG_PAY, POIS, RACES, RACE_PRIZES, STORY,
} from './config.js';
import { districtAt } from './world.js';

const ARRIVE_RANGE = 8;
const DELIVER_FROM = { 1: ['hotel', 'bank'], 2: ['market', 'marina'], 5: ['market', 'museum'], 12: ['bank', 'marina'], 15: ['casino', 'hotel'], 18: ['casino', 'bank'] };
const CHASE_SPEC = { 7: ['corso', 'mercado'], 11: ['fluxs', 'alto'], 16: ['voltgt', 'playa'] };
const COLLECT_SPEC = { 3: ['centro', 3], 8: ['alto', 3], 13: ['harbor', 5] };
const TIMERUN_SPEC = { 4: 80, 17: 70 };
const ESCAPE_SPEC = { 9: 3, 14: 4, 19: 5 };
const DISTRICT_ANCHORS = { palmas: [-168, -168], alto: [168, -168], mercado: [-168, 0], centro: [0, 0], harbor: [-112, 168], playa: [168, 168] };
const RIVAL_MODELS = ['corso', 'voltgt', 'fluxs'];

export function createMissions(deps) {
  const { world, vehicles, police, progression, rng, hooks } = deps;
  const poiPos = (id) => {
    const poi = world.poi(id);
    return { x: poi.x, z: poi.z, name: poi.name };
  };

  // ------------------------------------------------------------ story
  let job = null; // runtime for STORY[progression.state.storyIndex]
  function startJob() {
    const index = progression.state.storyIndex;
    if (index >= STORY.length) {
      job = null;
      return;
    }
    const def = STORY[index];
    job = { def, index, stage: 'main', timer: 0, points: [], targetCar: null, wasHot: false, hotTime: 0 };
    if (def.type === 'deliver') job.stage = 'pickup';
    if (def.type === 'collect') {
      const [district, count] = COLLECT_SPEC[index];
      const [ax, az] = DISTRICT_ANCHORS[district];
      const used = new Set();
      while (job.points.length < count) {
        const px = ax + rng.int(-1, 1) * 56;
        const pz = az + rng.int(-1, 1) * 56;
        const key = `${px},${pz}`;
        if (used.has(key)) continue;
        used.add(key);
        job.points.push({ x: px, z: pz, taken: false });
      }
    }
    if (def.type === 'chase') {
      const [model, district] = CHASE_SPEC[index];
      const [ax, az] = DISTRICT_ANCHORS[district];
      job.targetCar = vehicles.spawnCar(model, ax + rng.range(-30, 30), az + rng.range(-30, 30), rng.range(0, 6.28), 'target', { color: 0xff2255 });
    }
    if (def.type === 'escape') police.setHeat(Math.max(police.heat, ESCAPE_SPEC[index]));
    if (def.type === 'timerun') job.timer = TIMERUN_SPEC[index];
    if (hooks?.onMarisol) hooks.onMarisol(def.text);
    if (index === 0 || STORY[index - 1].ch !== def.ch) {
      if (hooks?.onChapter) hooks.onChapter(def.ch);
    }
  }

  function completeJob() {
    const def = job.def;
    progression.payStory(def.payout);
    progression.addStanding(districtAt(lastFocus.x, lastFocus.z), 12);
    if (hooks?.onJobPaid) hooks.onJobPaid(def);
    if (job.targetCar) {
      vehicles.removeCar(job.targetCar);
      job.targetCar = null;
    }
    progression.state.storyIndex++;
    progression.save();
    if (progression.state.storyIndex >= STORY.length) {
      job = null;
      if (hooks?.onStoryComplete) hooks.onStoryComplete();
      return;
    }
    startJob();
  }

  function storyTarget() {
    if (!job) return null;
    const def = job.def;
    if (def.type === 'goto' || def.type === 'timerun') return poiPos(def.at);
    if (def.type === 'deliver') {
      const [from, to] = DELIVER_FROM[job.index];
      return poiPos(job.stage === 'pickup' ? from : to);
    }
    if (def.type === 'collect') {
      const next = job.points.find((p) => !p.taken);
      return next ? { x: next.x, z: next.z, name: 'drop marker' } : null;
    }
    if (def.type === 'chase') return job.targetCar ? { x: job.targetCar.x, z: job.targetCar.z, name: 'the rival car' } : null;
    return null; // escape has no marker: lose the heat
  }

  function storyText() {
    if (!job) return { title: 'Azul is yours', sub: 'The debt is dead. Free-roam: gigs Y, contracts U, phone T.' };
    const def = job.def;
    const head = `Job ${job.index + 1}/20 — ${def.title}`;
    switch (def.type) {
      case 'goto': return { title: head, sub: `Get to ${poiPos(def.at).name}` };
      case 'timerun': return { title: head, sub: `Reach ${poiPos(def.at).name} in ${Math.ceil(job.timer)}s` };
      case 'deliver': {
        const [from, to] = DELIVER_FROM[job.index];
        return { title: head, sub: job.stage === 'pickup' ? `Pick up at ${poiPos(from).name} (bring a car)` : `Deliver to ${poiPos(to).name}` };
      }
      case 'collect': {
        const left = job.points.filter((p) => !p.taken).length;
        return { title: head, sub: `Collect the drops: ${left} left` };
      }
      case 'chase': return { title: head, sub: 'Wreck the marked rival car' };
      case 'escape': return { title: head, sub: police.heat > 0 ? `Lose the heat — ${police.stars} star${police.stars > 1 ? 's' : ''}` : 'Stay hidden…' };
      default: return { title: head, sub: '' };
    }
  }

  function updateStory(dt, focus, inCar, playerCar) {
    if (!job) return;
    const def = job.def;
    const target = storyTarget();
    if (def.type === 'timerun') {
      job.timer -= dt;
      if (job.timer <= 0) {
        if (hooks?.onFail) hooks.onFail('Out of time — the run resets. Go again.');
        job.timer = TIMERUN_SPEC[job.index];
      }
    }
    if (def.type === 'escape') {
      if (police.heat > 0) {
        job.wasHot = true;
        job.hotTime += dt;
      } else if (job.wasHot && job.hotTime > 2) {
        completeJob();
        return;
      }
    }
    if (def.type === 'chase' && job.targetCar) {
      const car = job.targetCar;
      if (car === playerCar) {
        // Driving off in the rival's own car ends the tour just as well.
        job.targetCar = null;
        completeJob();
        return;
      }
      if (car.dead) {
        completeJob();
        return;
      }
      // The rival flees the player and circles its district.
      const away = Math.atan2(car.x - focus.x, car.z - focus.z);
      const [ax, az] = DISTRICT_ANCHORS[CHASE_SPEC[job.index][1]];
      const tx = THREE.MathUtils.clamp(car.x + Math.sin(away) * 40, ax - 90, ax + 90);
      const tz = THREE.MathUtils.clamp(car.z + Math.cos(away) * 40, az - 90, az + 90);
      vehicles.steerToward(car, tx, tz, dt, { speedScale: 0.9 });
      if (Math.hypot(car.x - focus.x, car.z - focus.z) > 280) {
        car.x = ax;
        car.z = az;
      }
    }
    if (!target) return;
    const d = Math.hypot(target.x - focus.x, target.z - focus.z);
    if (d > ARRIVE_RANGE) return;
    if (def.type === 'goto' || def.type === 'timerun') completeJob();
    else if (def.type === 'collect') {
      const point = job.points.find((p) => !p.taken);
      if (point) {
        point.taken = true;
        if (hooks?.onPickup) hooks.onPickup();
        if (job.points.every((p) => p.taken)) completeJob();
      }
    } else if (def.type === 'deliver') {
      if (!inCar) return;
      if (job.stage === 'pickup') {
        job.stage = 'drop';
        if (hooks?.onPickup) hooks.onPickup();
      } else completeJob();
    }
  }

  // ------------------------------------------------------------ gigs
  let gig = null;
  function startGig() {
    if (gig) return false;
    const kind = progression.state.gigCount % 2 === 0 ? 'taxi' : 'courier';
    const from = rng.pick(POIS);
    let to = rng.pick(POIS);
    if (to.id === from.id) to = POIS[(POIS.indexOf(from) + 3) % POIS.length];
    gig = { kind, stage: 'pickup', from, to, timer: 130 };
    progression.state.gigCount++;
    if (hooks?.onToast) hooks.onToast(kind === 'taxi' ? `🚕 Fare waiting at ${from.name}` : `📦 Pickup at ${from.name}`);
    return true;
  }
  function updateGig(dt, focus, inCar) {
    if (!gig) return;
    gig.timer -= dt;
    if (gig.timer <= 0) {
      if (hooks?.onFail) hooks.onFail('The gig timed out.');
      gig = null;
      return;
    }
    const poi = gig.stage === 'pickup' ? gig.from : gig.to;
    if (Math.hypot(poi.x - focus.x, poi.z - focus.z) > ARRIVE_RANGE) return;
    if (gig.stage === 'pickup') {
      if (gig.kind === 'taxi' && !inCar) return;
      gig.stage = 'drop';
      if (hooks?.onPickup) hooks.onPickup();
      if (hooks?.onToast) hooks.onToast(`Drop at ${gig.to.name} — ${Math.ceil(gig.timer)}s left`);
    } else {
      const pay = GIG_PAY[gig.kind] + Math.round(gig.timer / 6);
      progression.paySide(pay, gig.to.district);
      progression.state.stats.gigs++;
      progression.save();
      if (hooks?.onSidePaid) hooks.onSidePaid(`Gig complete: +$${pay}`);
      gig = null;
    }
  }

  // ------------------------------------------------------------ races
  let race = null;
  function raceStartNear(focus) {
    for (const def of RACES) {
      const [x, z] = def.points[0];
      if (Math.hypot(x - focus.x, z - focus.z) < 12) return def;
    }
    return null;
  }
  function startRace(def, playerCar) {
    if (race) return false;
    const rivals = def.points.length
      ? RIVAL_MODELS.map((model, i) => vehicles.spawnCar(model, def.points[0][0] + (i - 1) * 5, def.points[0][1] - 7 - i * 4, 0, 'rival'))
      : [];
    race = { def, rivals, playerNext: 1, countdown: 3, finished: false, playerDone: false, t: 0 };
    rivals.forEach((car, i) => {
      car.raceNext = 1;
    });
    void playerCar;
    if (hooks?.onToast) hooks.onToast(`🏁 ${def.name} — follow the magenta markers!`);
    return true;
  }
  function progressOf(car, next, points) {
    const [x, z] = points[next % points.length];
    return next * 10000 - Math.hypot(x - car.x, z - car.z);
  }
  function updateRace(dt, focus, playerCar) {
    if (!race) return;
    if (race.countdown > 0) {
      race.countdown -= dt;
      if (playerCar) playerCar.speed = 0;
      return;
    }
    race.t += dt;
    const points = race.def.points;
    const playerProgress = progressOf(focus, race.playerNext, points);
    for (const rival of race.rivals) {
      if (rival.dead) continue;
      const [x, z] = points[rival.raceNext % points.length];
      const rivalProgress = progressOf(rival, rival.raceNext, points);
      const band = THREE.MathUtils.clamp(1 + (playerProgress - rivalProgress) * 0.00006, 0.86, 1.05);
      vehicles.steerToward(rival, x, z, dt, { speedScale: band });
      if (Math.hypot(x - rival.x, z - rival.z) < 11) rival.raceNext++;
    }
    if (playerCar) {
      const [x, z] = points[race.playerNext % points.length];
      if (Math.hypot(x - focus.x, z - focus.z) < 12) {
        race.playerNext++;
        if (hooks?.onPickup) hooks.onPickup();
      }
    }
    const total = points.length;
    if (!race.playerDone && race.playerNext > total) {
      race.playerDone = true;
      const ahead = race.rivals.filter((r) => r.raceNext > total).length;
      const position = ahead + 1;
      const prize = RACE_PRIZES[position - 1] ?? 0;
      progression.state.stats.racesRun++;
      if (position === 1) progression.state.stats.racesWon++;
      if (prize > 0) progression.paySide(prize, districtAt(focus.x, focus.z));
      progression.save();
      if (hooks?.onSidePaid) hooks.onSidePaid(`🏁 ${race.def.name}: P${position}${prize ? ` — +$${prize}` : ''}`);
      endRace();
    } else if (race.rivals.every((r) => r.raceNext > total)) {
      if (hooks?.onFail) hooks.onFail('The rivals finished without you.');
      endRace();
    }
  }
  function endRace() {
    if (!race) return;
    for (const rival of race.rivals) vehicles.removeCar(rival);
    race = null;
  }
  function raceMarker() {
    if (!race || race.countdown > 0) return null;
    const [x, z] = race.def.points[race.playerNext % race.def.points.length];
    return { x, z, color: 0xff2ea6 };
  }
  function raceText() {
    if (!race) return null;
    if (race.countdown > 0) return { title: race.def.name, sub: `Starting in ${Math.ceil(race.countdown)}…` };
    return { title: `🏁 ${race.def.name}`, sub: `Checkpoint ${Math.min(race.playerNext, race.def.points.length)}/${race.def.points.length}` };
  }

  // ------------------------------------------------------------ bounties
  let bounty = { index: 0, car: null, respawn: 0, pin: 0, wander: null };
  const bountyRing = new THREE.Mesh(new THREE.RingGeometry(3, 3.7, 24), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  bountyRing.rotation.x = -Math.PI / 2;
  bountyRing.visible = false;
  deps.scene.add(bountyRing);
  function spawnBounty() {
    const def = BOUNTIES[bounty.index % BOUNTIES.length];
    const [ax, az] = DISTRICT_ANCHORS[def.district];
    bounty.car = vehicles.spawnCar(def.car, ax + rng.range(-40, 40), az + rng.range(-40, 40), rng.range(0, 6.28), 'target', { name: def.name });
    bounty.wander = { x: ax, z: az };
    bounty.pin = 0;
    bountyRing.visible = true;
  }
  function collectBounty(how) {
    const def = BOUNTIES[bounty.index % BOUNTIES.length];
    progression.paySide(def.reward, def.district);
    progression.state.stats.bounties++;
    progression.save();
    if (hooks?.onSidePaid) hooks.onSidePaid(`🎯 Bounty: ${def.name} ${how} — +$${def.reward}`);
    if (bounty.car && !bounty.car.dead && how !== 'taken') {
      bounty.car.kind = 'parked';
      bounty.car.speed = 0;
    }
    bounty.car = null;
    bountyRing.visible = false;
    bounty.index++;
    bounty.respawn = BOUNTY_RESPAWN_SECONDS;
  }
  function updateBounty(dt, focus, playerCar) {
    if (!bounty.car) {
      bounty.respawn -= dt;
      if (bounty.respawn <= 0) spawnBounty();
      return;
    }
    const car = bounty.car;
    bountyRing.position.set(car.x, 0.09, car.z);
    if (car === playerCar) {
      collectBounty('taken');
      return;
    }
    if (car.dead) {
      collectBounty('wrecked');
      return;
    }
    const distToPlayer = Math.hypot(car.x - focus.x, car.z - focus.z);
    if (distToPlayer < 26) {
      // Flee: run from the player, biased back toward the home district.
      const [ax, az] = DISTRICT_ANCHORS[BOUNTIES[bounty.index % BOUNTIES.length].district];
      const away = Math.atan2(car.x - focus.x, car.z - focus.z);
      vehicles.steerToward(car, car.x + Math.sin(away) * 50 + (ax - car.x) * 0.2, car.z + Math.cos(away) * 50 + (az - car.z) * 0.2, dt, { speedScale: 0.94 });
    } else {
      if (!bounty.wander || Math.hypot(bounty.wander.x - car.x, bounty.wander.z - car.z) < 9) {
        bounty.wander = { x: car.x + rng.range(-70, 70), z: car.z + rng.range(-70, 70) };
      }
      vehicles.steerToward(car, bounty.wander.x, bounty.wander.z, dt, { speedScale: 0.5 });
    }
    // Pin: nose-to-car contact at a crawl, held, makes the driver bail.
    if (playerCar && distToPlayer < 3.6 && Math.abs(car.speed) < 1.4) {
      bounty.pin += dt;
      if (bounty.pin >= BOUNTY_PIN_SECONDS) collectBounty('pinned');
    } else {
      bounty.pin = Math.max(0, bounty.pin - dt);
    }
  }

  // ------------------------------------------------------------ contracts
  let contract = null;
  const offer = () => CONTRACTS[progression.state.contractIndex % CONTRACTS.length];
  function acceptContract() {
    if (contract) return false;
    const def = offer();
    contract = { def, stage: 'pickup', timer: def.seconds };
    if (hooks?.onToast) hooks.onToast(`🧾 Contract: pick up ${def.client} at ${world.poi(def.from).name}`);
    return true;
  }
  function updateContract(dt, focus, inCar) {
    if (!contract) return;
    contract.timer -= dt;
    if (contract.timer <= 0) {
      if (hooks?.onFail) hooks.onFail('Contract blown — the client walked.');
      contract = null;
      progression.state.contractIndex++;
      return;
    }
    const poi = world.poi(contract.stage === 'pickup' ? contract.def.from : contract.def.to);
    if (Math.hypot(poi.x - focus.x, poi.z - focus.z) > ARRIVE_RANGE) return;
    if (contract.stage === 'pickup') {
      if (!inCar) return;
      contract.stage = 'deliver';
      contract.timer = contract.def.seconds;
      if (hooks?.onPickup) hooks.onPickup();
      if (hooks?.onToast) hooks.onToast(`Deliver to ${world.poi(contract.def.to).name} — keep it under ${contract.def.starCap} star${contract.def.starCap === 1 ? '' : 's'}`);
    } else {
      let fee = contract.def.fee + Math.round(contract.def.fee * CONTRACT_EARLY_BONUS * (contract.timer / contract.def.seconds));
      let note = '';
      if (police.stars > contract.def.starCap) {
        fee = Math.round(fee / 2);
        note = ' (hot delivery: half fee)';
      }
      progression.paySide(fee, world.poi(contract.def.to).district);
      progression.state.stats.contracts++;
      progression.state.contractIndex++;
      progression.save();
      if (hooks?.onSidePaid) hooks.onSidePaid(`🧾 Contract done: +$${fee}${note}`);
      contract = null;
    }
  }
  function contractText() {
    if (!contract) return null;
    const poi = world.poi(contract.stage === 'pickup' ? contract.def.from : contract.def.to);
    return {
      title: `🧾 ${contract.def.client}`,
      sub: `${contract.stage === 'pickup' ? 'Pick up' : 'Deliver to'} ${poi.name} — ${Math.ceil(contract.timer)}s, max ${contract.def.starCap}★`,
    };
  }
  function contractMarker() {
    if (!contract) return null;
    const poi = world.poi(contract.stage === 'pickup' ? contract.def.from : contract.def.to);
    return { x: poi.x, z: poi.z, color: 0x18e0ff };
  }

  // ------------------------------------------------------------ shared
  let lastFocus = { x: 0, z: 0 };
  let lastMarker = null;
  startJob();

  return {
    get job() { return job; },
    get gig() { return gig; },
    get race() { return race; },
    get contract() { return contract; },
    bountyTarget: () => bounty.car,
    markerPos: () => lastMarker,
    bountyDef: () => BOUNTIES[bounty.index % BOUNTIES.length],
    contractOffer: offer,
    startGig,
    startRace,
    cancelRace: endRace,
    raceStartNear,
    acceptContract,
    restartJob: startJob,
    /** The objective line: races and contracts shout over the story, gigs next. */
    objective() {
      if (race) return raceText();
      if (contract) return contractText();
      if (gig) {
        const poi = gig.stage === 'pickup' ? gig.from : gig.to;
        return { title: gig.kind === 'taxi' ? '🚕 Taxi fare' : '📦 Courier run', sub: `${gig.stage === 'pickup' ? 'Pick up at' : 'Drop at'} ${poi.name} — ${Math.ceil(gig.timer)}s` };
      }
      return storyText();
    },
    update(dt, focus, inCar, playerCar) {
      lastFocus = focus;
      updateStory(dt, focus, inCar, playerCar);
      updateGig(dt, focus, inCar);
      updateRace(dt, focus, playerCar);
      updateBounty(dt, focus, playerCar);
      updateContract(dt, focus, inCar);
      // One beam marker, by priority.
      const marker = raceMarker() ?? contractMarker()
        ?? (gig ? { x: (gig.stage === 'pickup' ? gig.from : gig.to).x, z: (gig.stage === 'pickup' ? gig.from : gig.to).z, color: 0x57f2a0 } : null)
        ?? (() => {
          const t = storyTarget();
          return t ? { x: t.x, z: t.z, color: 0xffd23c } : null;
        })();
      lastMarker = marker;
      if (marker) world.setMarker(marker.x, marker.z, marker.color);
      else world.clearMarker();
    },
  };
}
