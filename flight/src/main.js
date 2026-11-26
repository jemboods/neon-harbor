// The loop and the wiring: fixed-step simulation, the screens (title, play, paused,
// over), the camera toggle, and the session's best times. The title backdrop is a
// real sortie flown by the autopilot, so the menu sits over live sky.
import { STEP } from './config.js';
import { createWorld } from './world.js';
import {
  createFlight, autopilotControl,
  MODE_COURSE, MODE_LANDING, MODE_FREE,
  END_COMPLETE, END_LANDED, EVENT_RING, EVENT_REFUELLED,
} from './flight.js';
import {
  createRenderer,
  SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER,
  VIEW_COCKPIT, VIEW_CHASE,
} from './render.js';
import {
  createInput,
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_BACK, ACTION_GUSTS, ACTION_MUTE,
  ACTION_UP, ACTION_DOWN, ACTION_FLAPS, ACTION_VIEW,
} from './input.js';
import { createAudio } from './audio.js';
import { installShots } from './shots.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
window.addEventListener('resize', renderer.resize);
const input = createInput(canvas);
const audio = createAudio();
const world = createWorld();

let screen = SCREEN_TITLE;
let view = VIEW_CHASE;
let menuIndex = 0;
let current = { mode: MODE_COURSE, course: 0 };
let flight = createFlight(world, MODE_COURSE, 0);
let backdropClock = 0;
let backdropCourse = 0;
let lastPitchIn = 0;
let lastRollIn = 0;
const bests = {};

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function menuItems() {
  return [
    { label: 'Harbour Loop — 6 rings', sub: bests.harbour ? `best ${formatClock(bests.harbour)}` : 'Pulau Besar circuit', mode: MODE_COURSE, course: 0 },
    { label: 'Volcano Run — 8 rings', sub: bests.volcano ? `best ${formatClock(bests.volcano)}` : 'Gunung Api out and back', mode: MODE_COURSE, course: 1 },
    { label: 'Grand Tour — 10 rings', sub: bests.tour ? `best ${formatClock(bests.tour)}` : 'The whole archipelago', mode: MODE_COURSE, course: 2 },
    { label: 'Landing challenge', sub: bests.landing ? `best ${bests.landing}` : 'Runway 27 final, full flap', mode: MODE_LANDING, course: 0 },
    { label: 'Free flight', sub: 'No clock, just sky', mode: MODE_FREE, course: 0 },
  ];
}

function startSortie(mode, course) {
  current = { mode, course };
  flight = createFlight(world, mode, course);
  screen = SCREEN_PLAY;
  audio.ensure();
}

function toTitle() {
  backdropCourse = (backdropCourse + 1) % 3;
  flight = createFlight(world, MODE_COURSE, backdropCourse);
  backdropClock = 0;
  screen = SCREEN_TITLE;
}

function recordResult() {
  const state = flight.state;
  if (state.end === END_COMPLETE && state.course) {
    if (!bests[state.course.id] || state.time < bests[state.course.id]) bests[state.course.id] = state.time;
  }
  if (state.end === END_LANDED && (!bests.landing || state.score > bests.landing)) {
    bests.landing = state.score;
  }
}

function finishSortie() {
  recordResult();
  const state = flight.state;
  if (state.end === END_LANDED || state.end === END_COMPLETE) audio.arrived();
  else audio.crash();
  screen = SCREEN_OVER;
}

function onEvents(events) {
  if (events & EVENT_RING) audio.ring();
  if (events & EVENT_REFUELLED) audio.refuel();
}

function toggleView() {
  view = view === VIEW_COCKPIT ? VIEW_CHASE : VIEW_COCKPIT;
}

function handleActions(actions) {
  if (actions & ACTION_MUTE) audio.toggleMute();
  if (screen === SCREEN_TITLE) {
    const items = menuItems();
    if (actions & ACTION_UP) menuIndex = (menuIndex + items.length - 1) % items.length;
    if (actions & ACTION_DOWN) menuIndex = (menuIndex + 1) % items.length;
    if (actions & ACTION_CONFIRM) startSortie(items[menuIndex].mode, items[menuIndex].course);
    return;
  }
  if (screen === SCREEN_PLAY) {
    if (actions & (ACTION_PAUSE | ACTION_BACK)) screen = SCREEN_PAUSED;
    else {
      if (actions & ACTION_VIEW) toggleView();
      if (actions & ACTION_GUSTS) flight.state.gustsOn = !flight.state.gustsOn;
    }
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (actions & (ACTION_PAUSE | ACTION_BACK)) screen = SCREEN_PLAY;
    else if (actions & ACTION_CONFIRM) toTitle();
    else if (actions & ACTION_VIEW) toggleView();
    return;
  }
  if (screen === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM) startSortie(current.mode, current.course);
    else if (actions & ACTION_BACK) toTitle();
  }
}

function ui() {
  return {
    view,
    menu: menuItems(),
    menuIndex,
    muted: audio.muted,
    bests,
    pitchIn: lastPitchIn,
    rollIn: lastRollIn,
  };
}

installShots({
  getFlight: () => flight,
  startSortie,
  setView: (next) => { view = next; },
  setScreen: (next) => { screen = next; },
  autopilot: autopilotControl,
  stepSeconds: STEP,
  drawNow: () => renderer.draw(flight.state, screen, ui()),
  recordResult,
});

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const actions = input.takeActions();
  handleActions(actions);
  lastPitchIn = input.pitch();
  lastRollIn = input.roll();

  if (!window.__shotsActive && (screen === SCREEN_PLAY || screen === SCREEN_TITLE)) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 10) {
      const control = screen === SCREEN_TITLE
        ? autopilotControl(flight.state)
        : {
            pitch: lastPitchIn,
            roll: lastRollIn,
            throttleDelta: input.throttleDelta(),
            flapCycle: (actions & ACTION_FLAPS) !== 0 && steps === 0,
          };
      const events = flight.step(STEP, control);
      onEvents(events);
      accumulator -= STEP;
      steps += 1;
      if (screen === SCREEN_TITLE) {
        backdropClock += STEP;
        if (flight.state.end !== '' || backdropClock > 170) {
          toTitle();
          break;
        }
      } else if (flight.state.end !== '') {
        finishSortie();
        break;
      }
    }
    if (steps === 10) accumulator = 0;
  }

  audio.update(flight.state);
  renderer.draw(flight.state, screen, ui());
}

requestAnimationFrame(frame);
