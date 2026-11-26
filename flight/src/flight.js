// The flight model and the sortie: one plane, its controls, the wind, the fuel, the ring
// course, the landing grade and every way a flight can end. No drawing and no browser in
// here: step() advances one fixed step from a control demand and returns what happened
// as bit flags, so the caller can play sounds and flash messages without the model
// knowing about screens.
import { DAY, FLAP, FUEL, LANDING, PLANE, RING, RPM, UNITS, WIND } from './config.js';

export const MODE_COURSE = 'course';
export const MODE_LANDING = 'landing';
export const MODE_FREE = 'free';

export const EVENT_RING = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_CRASH = 4;
export const EVENT_LIFTOFF = 8;
export const EVENT_LOW_FUEL = 16;
export const EVENT_REFUELLED = 32;

export const END_NONE = '';
export const END_COMPLETE = 'complete';
export const END_LANDED = 'landed';
export const END_CRASHED = 'crashed';
export const END_DITCHED = 'ditched';

/** Wrap an angle to -pi..pi. */
export function wrapAngle(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/** The letter a landing score earns. */
export function gradeOf(score) {
  if (score >= 900) return 'S';
  if (score >= 750) return 'A';
  if (score >= 550) return 'B';
  if (score >= 350) return 'C';
  return 'D';
}

export function createFlight(world, mode, courseIndex = 0) {
  const course = mode === MODE_COURSE ? world.courses[courseIndex] : null;
  const state = {
    world,
    mode,
    course,
    phase: mode === MODE_LANDING ? 0.7 : DAY.startPhase,
    elapsed: 0,
    x: 0, y: 0, z: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0.6,
    flapIndex: 0,
    flapDeg: 0,
    rpm: 0,
    turnRate: 0,
    vspeed: 0,
    stalled: false,
    fuel: FUEL.capacity,
    onGround: false,
    gustsOn: true,
    windNow: 0,
    gustPhase: 0,
    ringsHit: 0,
    nextRing: 0,
    parked: false,
    time: 0,
    distance: 0,
    maxAlt: 0,
    landings: 0,
    lowFuelWarned: false,
    message: '',
    messageTtl: 0,
    callout: '',
    calloutTtl: 0,
    radio: {},
    end: END_NONE,
    endReason: '',
    score: 0,
    grade: '',
    breakdown: [],
    prevX: 0, prevY: 0, prevZ: 0,
  };

  const runway = world.runway;
  if (mode === MODE_LANDING) {
    // On final for runway 27: east of the field, lined up on the centreline, flying west.
    state.x = runway.x + runway.dirX * 1750;
    state.y = runway.y + runway.dirY * 1750;
    state.z = runway.elevation + 150;
    state.heading = runway.heading + Math.PI;
    state.speed = 40;
    state.throttle = 0.38;
    state.flapIndex = 2;
    state.flapDeg = FLAP.steps[2];
  } else {
    // Airborne south of Pulau Besar, flying north at the island to start a sortie.
    state.x = world.mainIsland.x + 100;
    state.y = world.mainIsland.y - 2100;
    state.z = 190;
    state.heading = 0;
    state.speed = 56;
    state.throttle = 0.65;
  }
  state.prevX = state.x;
  state.prevY = state.y;
  state.prevZ = state.z;
  state.maxAlt = state.z;

  function flash(text, seconds = 2.2) {
    state.message = text;
    state.messageTtl = seconds;
  }

  /** A radio-style caption, shown low on the screen: "Final approach, runway 27". */
  function callout(text, seconds = 3.2) {
    state.callout = text;
    state.calloutTtl = seconds;
  }

  /** Fire a radio line once per key, until the key is cleared (on liftoff, say). */
  function calloutOnce(key, text) {
    if (state.radio[key]) return;
    state.radio[key] = true;
    callout(text);
  }

  /** Grade a touchdown in the runway frame, from the state at first contact. */
  function gradeTouchdown(vz, heading) {
    const frame = world.runwayFrame(state.x, state.y);
    const errToHeading = Math.abs(wrapAngle(heading - runway.heading));
    const errToReverse = Math.abs(wrapAngle(heading - runway.heading - Math.PI));
    const reversed = errToReverse < errToHeading;
    const headingErr = Math.min(errToHeading, errToReverse);
    const alongFromThreshold = reversed ? runway.length / 2 - frame.along : frame.along + runway.length / 2;
    const lateral = clamp(1 - Math.abs(frame.across) / LANDING.lateralFull, 0, 1);
    const head = clamp(1 - headingErr / LANDING.headingFull, 0, 1);
    const alignment = Math.round(LANDING.points.alignment * (lateral * 0.7 + head * 0.3));
    const descent = Math.round(LANDING.points.descent * clamp(1 - Math.abs(vz + 2.2) / 6.5, 0, 1));
    const touchdown = Math.round(LANDING.points.touchdown * clamp(1 - Math.abs(alongFromThreshold - LANDING.idealTouchdown) / LANDING.spread, 0, 1));
    return { total: alignment + descent + touchdown, rows: [
      { label: 'Alignment', value: alignment },
      { label: 'Descent rate', value: descent },
      { label: 'Touchdown point', value: touchdown },
    ] };
  }

  function endSortie(kind, reason, rows, score) {
    state.end = kind;
    state.endReason = reason;
    state.breakdown = rows;
    state.score = score;
    state.grade = kind === END_LANDED || (kind === END_COMPLETE && state.mode === MODE_LANDING) ? gradeOf(score) : '';
  }

  function finishCourse() {
    const timeBonus = Math.max(0, Math.round((course.par - state.time) * RING.parSecondPoints));
    const rows = [
      { label: `Rings ${state.ringsHit} of ${course.rings.length}`, value: state.ringsHit * RING.points },
      { label: `Time bonus (par ${course.par}s)`, value: timeBonus },
      { label: 'Completion bonus', value: RING.finishBonus },
    ];
    endSortie(END_COMPLETE, `${course.name} complete in ${state.time.toFixed(1)}s`, rows,
      state.ringsHit * RING.points + timeBonus + RING.finishBonus);
  }

  function crash(kind, reason) {
    const rows = state.mode === MODE_COURSE
      ? [{ label: `Rings ${state.ringsHit} of ${course.rings.length}`, value: state.ringsHit * RING.points }]
      : [{ label: 'Distance flown', value: Math.round(state.distance) },
         { label: 'Highest point', value: Math.round(state.maxAlt * 3.281) }];
    endSortie(kind, reason, rows, state.mode === MODE_COURSE ? state.ringsHit * RING.points : Math.round(state.distance / 20));
  }

  /** First contact with the ground: a landing, a crash, or the sea. Returns event flags. */
  function touchGround(vz) {
    const frame = world.runwayFrame(state.x, state.y);
    const onStrip = Math.abs(frame.across) <= runway.width / 2 && Math.abs(frame.along) <= runway.length / 2;
    if (!onStrip) {
      const gh = world.groundHeight(state.x, state.y);
      if (gh <= 0.2) crash(END_DITCHED, 'Down in the sea, short of the field.');
      else if (gh <= runway.elevation + 1.5) crash(END_CRASHED, 'Came down beside the runway.');
      else crash(END_CRASHED, 'Flew into the terrain.');
      return EVENT_CRASH;
    }
    if (vz < LANDING.crashSink) {
      crash(END_CRASHED, 'Came down far too hard on the runway.');
      return EVENT_CRASH;
    }
    if (state.speed > 78) {
      crash(END_CRASHED, 'Touched down far too fast and ran off the end.');
      return EVENT_CRASH;
    }
    const grade = gradeTouchdown(vz, state.heading);
    state.onGround = true;
    state.z = runway.elevation;
    state.pitch = 0;
    state.roll = 0;
    state.landings += 1;
    if (state.mode === MODE_LANDING) {
      endSortie(END_LANDED, 'Down and safe at Pulau Besar.', grade.rows, grade.total);
    } else {
      flash(`Touchdown — grade ${gradeOf(grade.total)} (${grade.total})`);
    }
    return EVENT_TOUCHDOWN;
  }

  /**
   * One fixed step. `control` is { pitch: -1..1, roll: -1..1, throttleDelta: rate }.
   * Returns EVENT_* flags for what happened during the step.
   */
  function step(dt, control) {
    if (state.end !== END_NONE) return 0;
    let events = 0;
    state.elapsed += dt;
    state.time += dt;
    state.phase = (state.phase + dt / DAY.length) % 1;
    if (state.messageTtl > 0) state.messageTtl -= dt;
    if (state.calloutTtl > 0) state.calloutTtl -= dt;
    state.prevX = state.x;
    state.prevY = state.y;
    state.prevZ = state.z;

    // Flaps: a press cycles the lever through its stops; the surfaces travel at a rate.
    if (control.flapCycle) state.flapIndex = (state.flapIndex + 1) % FLAP.steps.length;
    if (control.flapIndex !== undefined) state.flapIndex = control.flapIndex;
    const flapTarget = FLAP.steps[state.flapIndex];
    state.flapDeg += clamp(flapTarget - state.flapDeg, -FLAP.transitRate * dt, FLAP.transitRate * dt);
    const stallNow = PLANE.stallSpeed * (1 - state.flapDeg * FLAP.stallPerDeg);
    state.stallSpeed = stallNow;

    state.throttle = clamp(state.throttle + control.throttleDelta * dt, 0, 1);
    const engineOut = state.fuel <= 0;
    const throttleEff = engineOut ? 0 : state.throttle;

    // The tachometer chases the lever: idle with the engine on, zero with it out.
    const rpmTarget = engineOut ? 0 : RPM.idle + throttleEff * (RPM.full - RPM.idle);
    state.rpm += clamp(rpmTarget - state.rpm, -900 * dt, 900 * dt);

    // Wind: the steady sortie wind plus a breathing gust when gusts are on.
    state.gustPhase += dt * WIND.gustRate * Math.PI * 2;
    const gust = state.gustsOn
      ? (Math.sin(state.gustPhase) * 0.6 + Math.sin(state.gustPhase * 2.7 + 1.3) * 0.4) * WIND.gustAmp
      : 0;
    state.windNow = Math.max(0, world.wind.speed + gust);

    if (state.onGround) {
      // Ground roll: steer with the rudder, lift off when fast and asked.
      state.vspeed = 0;
      state.heading += control.roll * dt * clamp(state.speed / 16, 0, 1) * 0.85;
      let accel = throttleEff * PLANE.thrustAccel - PLANE.dragQuad * state.speed * state.speed - state.speed * 0.1;
      if (state.throttle < 0.05) accel -= 2.4;
      state.speed = Math.max(0, state.speed + accel * dt);
      state.x += Math.sin(state.heading) * state.speed * dt;
      state.y += Math.cos(state.heading) * state.speed * dt;
      state.distance += state.speed * dt;
      // Takeoff calls as the roll builds: the airspeed comes alive, then rotate.
      const knots = state.speed * UNITS.knotsPerMs;
      if (knots > 20) calloutOnce('alive', 'Airspeed alive');
      if (state.speed >= PLANE.rotateSpeed) calloutOnce('rotate', '55 — rotate');
      const ground = world.groundHeight(state.x, state.y);
      if (ground > state.z + 0.6) {
        crash(END_CRASHED, 'Ran into rising ground on the roll.');
        return events | EVENT_CRASH;
      }
      if (ground < state.z - 2) {
        // Rolled off the bench edge: airborne again, and falling.
        state.onGround = false;
        state.parked = false;
      } else {
        state.z = ground;
      }
      if (!state.onGround) {
        // Just left the bench; fall through to the airborne rules next step.
      } else if (state.speed > Math.max(PLANE.rotateSpeed, stallNow * 1.05) && control.pitch > 0.25) {
        state.onGround = false;
        state.parked = false;
        state.radio.alive = false;
        state.radio.rotate = false;
        state.z = ground + 2.5; // clear of the contact check while the climb builds
        events |= EVENT_LIFTOFF;
        flash('Airborne again');
      } else if (state.speed <= 0.01 && state.throttle < 0.05 && !state.parked) {
        state.parked = true;
        if (state.mode === MODE_FREE) {
          endSortie(END_LANDED, 'Parked at Pulau Besar.', [
            { label: 'Time airborne', value: Math.round(state.time) },
            { label: 'Distance flown', value: Math.round(state.distance) },
            { label: 'Landings', value: state.landings },
          ], Math.round(state.distance / 20 + state.maxAlt * 0.5 + state.landings * 250));
        } else if (state.mode === MODE_COURSE) {
          state.fuel = FUEL.capacity;
          state.lowFuelWarned = false;
          events |= EVENT_REFUELLED;
          flash('Refuelled — throttle up and take off to finish the course');
        }
      }
      burnFuel(dt, true);
      return events;
    }

    // Controls chase the demand.
    const pitchTarget = control.pitch >= 0 ? control.pitch * PLANE.maxPitchUp : -control.pitch * PLANE.maxPitchDown;
    const rollTarget = control.roll * PLANE.maxRoll;
    state.pitch += clamp(pitchTarget - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    state.roll += clamp(rollTarget - state.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);

    // Stall: below the (flap-dependent) stall speed the nose drops and the sink builds.
    const stalled = state.speed < stallNow;
    state.stalled = stalled;
    if (stalled) state.pitch -= (1 - state.speed / stallNow) * dt * 0.85;
    state.pitch = clamp(state.pitch, -0.9, PLANE.maxPitchUp);

    // Speed along the flight path: thrust against drag (flaps drag too) and the climb.
    const accel = throttleEff * PLANE.thrustAccel
      - (PLANE.dragQuad + state.flapDeg * FLAP.dragPerDeg) * state.speed * state.speed
      - PLANE.gravityAlong * Math.sin(state.pitch);
    state.speed = clamp(state.speed + accel * dt, 0, PLANE.maxSpeed + 25);

    // A banked wing turns the plane; gusts worry it a little.
    const prevHeading = state.heading;
    state.heading += Math.sin(state.roll) * PLANE.turnGain * dt;
    state.turnRate = wrapAngle(state.heading - prevHeading) / dt;
    if (state.gustsOn) state.roll += Math.sin(state.gustPhase * 1.7) * 0.02 * dt * (state.windNow / WIND.maxSteady + 0.4);

    const horizontal = state.speed * Math.cos(state.pitch);
    let vz = state.speed * Math.sin(state.pitch);
    if (stalled) vz -= (1 - state.speed / stallNow) * PLANE.stallSink;
    // Ground effect: in the last few metres the wing floats, and the sink softens.
    if (vz < 0) {
      const heightHere = state.z - world.groundHeight(state.x, state.y);
      if (heightHere < 8) vz *= 0.7 + 0.3 * Math.max(0, heightHere) / 8;
    }
    state.vspeed = vz;
    const windX = world.wind.dirX * state.windNow;
    const windY = world.wind.dirY * state.windNow;
    state.x += (Math.sin(state.heading) * horizontal + windX) * dt;
    state.y += (Math.cos(state.heading) * horizontal + windY) * dt;
    state.z += vz * dt;
    state.distance += Math.hypot(Math.sin(state.heading) * horizontal + windX, Math.cos(state.heading) * horizontal + windY) * dt;
    if (state.z > state.maxAlt) state.maxAlt = state.z;

    burnFuel(dt, false);

    // Ring course: did the segment flown this step cross the next ring's disc?
    if (state.mode === MODE_COURSE && state.nextRing < course.rings.length) {
      const ring = course.rings[state.nextRing];
      const s0 = (state.prevX - ring.x) * ring.nx + (state.prevY - ring.y) * ring.ny;
      const s1 = (state.x - ring.x) * ring.nx + (state.y - ring.y) * ring.ny;
      if (s0 !== s1 && s0 * s1 <= 0) {
        const f = s0 / (s0 - s1);
        const qx = state.prevX + (state.x - state.prevX) * f;
        const qy = state.prevY + (state.y - state.prevY) * f;
        const qz = state.prevZ + (state.z - state.prevZ) * f;
        if (Math.hypot(qx - ring.x, qy - ring.y, qz - ring.z) <= ring.radius) {
          state.ringsHit += 1;
          state.nextRing += 1;
          events |= EVENT_RING;
          if (state.nextRing >= course.rings.length) finishCourse();
          else flash(`Ring ${state.ringsHit} of ${course.rings.length}`);
        }
      }
    }

    // Radio calls on the landing final: joining final, then the altitude ladder.
    if (state.mode === MODE_LANDING) {
      const thrX = runway.x + runway.dirX * (runway.length / 2);
      const thrY = runway.y + runway.dirY * (runway.length / 2);
      const distOut = (state.x - thrX) * runway.dirX + (state.y - thrY) * runway.dirY;
      if (distOut < 1800 && distOut > -100) calloutOnce('final', 'Final approach, runway 27');
      const aglFt = (state.z - runway.elevation) * UNITS.feetPerMetre;
      const ladder = [[1000, 'One thousand'], [500, 'Five hundred'], [200, 'Two hundred'], [100, 'One hundred']];
      for (const [feet, label] of ladder) {
        if (aglFt < feet && !state.radio['alt' + feet]) {
          for (const [higher] of ladder) if (higher >= feet) state.radio['alt' + higher] = true;
          callout(label);
          break;
        }
      }
    }

    // Ground contact.
    const ground = world.groundHeight(state.x, state.y);
    if (state.z <= ground + 0.8) {
      events |= touchGround(vz);
    }
    return events;
  }

  function burnFuel(dt, idling) {
    if (state.end !== END_NONE) return;
    const burn = (FUEL.burnBase * (idling ? 0.4 : 1) + (state.fuel > 0 ? state.throttle : 0) * FUEL.burnThrottle) * dt;
    state.fuel = Math.max(0, state.fuel - burn);
    if (!state.lowFuelWarned && state.fuel <= FUEL.lowWarning && state.fuel > 0) {
      state.lowFuelWarned = true;
      flash('Low fuel — the runway refuels you', 3);
    }
    if (state.fuel === 0 && !state.onGround) {
      // The engine is out; the sortie now ends wherever the glide does.
      if (state.messageTtl <= 0) flash('Out of fuel — glide for the runway', 1.2);
    }
  }

  return { state, step, flash };
}

/**
 * A simple pilot for the screenshot scenes and the title backdrop: steer at the next
 * ring, or fly the runway 27 final — full flap, on the glidepath to the aiming point.
 * Returns a control demand.
 */
export function autopilotControl(state) {
  const world = state.world;
  let tx;
  let ty;
  let tz;
  let speedTarget = 58;
  let flapIndex = 0;
  if (state.mode === MODE_LANDING || state.mode !== MODE_COURSE) {
    const runway = world.runway;
    // Runway 27: travel westward; the threshold is the strip's east end and the
    // touchdown point is the aiming point, 300 m beyond it.
    const thrX = runway.x + runway.dirX * (runway.length / 2);
    const thrY = runway.y + runway.dirY * (runway.length / 2);
    const hx = -runway.dirX;
    const hy = -runway.dirY;
    const distOut = (thrX - state.x) * hx + (thrY - state.y) * hy;
    if (state.onGround) return { pitch: 0, roll: 0, throttleDelta: -1, flapIndex: 3 };
    tx = thrX + hx * 300;
    ty = thrY + hy * 300;
    tz = runway.elevation;
    speedTarget = distOut > 500 ? 40 : 32.5;
    flapIndex = distOut < 1100 ? 3 : 2;
  } else if (state.nextRing < state.course.rings.length) {
    const ring = state.course.rings[state.nextRing];
    tx = ring.x;
    ty = ring.y;
    tz = ring.z;
  } else {
    tx = state.x + Math.sin(state.heading) * 500;
    ty = state.y + Math.cos(state.heading) * 500;
    tz = state.z;
  }
  const dx = tx - state.x;
  const dy = ty - state.y;
  const dist = Math.hypot(dx, dy);
  const desiredHeading = Math.atan2(dx, dy);
  const diff = wrapAngle(desiredHeading - state.heading);
  const roll = clamp(diff * 1.5, -1, 1);
  const desiredPitch = clamp(Math.atan2(tz - state.z, Math.max(dist, 60)), -0.34, 0.34);
  const pitch = clamp(desiredPitch / 0.4 + (state.speed < (state.stallSpeed ?? PLANE.stallSpeed) + 4 ? 0.25 : 0), -1, 1);
  const throttleDelta = state.speed < speedTarget - 3 ? 0.6 : state.speed > speedTarget + 3 ? -0.6 : 0;
  return { pitch, roll, throttleDelta, flapIndex };
}
