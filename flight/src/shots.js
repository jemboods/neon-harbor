// Deterministic screenshot scenes for the kit's capture flow: ?shot=<name> freezes
// the game into one composed frame and raises window.__shotReady. Each scene flies
// the real simulation with the autopilot, so the shots are honest gameplay.
import { MODE_COURSE, MODE_LANDING } from './flight.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, VIEW_CHASE, VIEW_COCKPIT } from './render.js';

/** Golden hour for the hero cockpit frame, late light for the rest. */
const HERO_PHASE = 0.72;
const DAY_PHASE = 0.3;

export function installShots(hooks) {
  const shot = new URLSearchParams(window.location.search).get('shot');
  if (!shot) return;
  window.__shotsActive = true;

  const stepAutopilot = (count) => {
    for (let index = 0; index < count; index += 1) {
      const flight = hooks.getFlight();
      flight.step(hooks.stepSeconds, hooks.autopilot(flight.state));
    }
  };

  async function run() {
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (shot === 'cockpit') {
      hooks.startSortie(MODE_LANDING, 0);
      hooks.setView(VIEW_COCKPIT);
      hooks.setScreen(SCREEN_PLAY);
      stepAutopilot(1750); // short final for runway 27, settled on the centreline
      hooks.getFlight().state.phase = HERO_PHASE;
    } else if (shot === 'chase') {
      hooks.startSortie(MODE_COURSE, 0);
      hooks.setView(VIEW_CHASE);
      hooks.setScreen(SCREEN_PLAY);
      stepAutopilot(640); // mid-course on the Harbour Loop, first ring close ahead
      hooks.getFlight().state.phase = DAY_PHASE;
    } else if (shot === 'title') {
      hooks.setScreen(SCREEN_TITLE);
      stepAutopilot(200);
      hooks.getFlight().state.phase = 0.66;
    } else if (shot === 'end') {
      hooks.startSortie(MODE_LANDING, 0);
      hooks.setView(VIEW_COCKPIT);
      let guard = 0;
      while (hooks.getFlight().state.end === '' && guard < 60 * 240) {
        const flight = hooks.getFlight();
        flight.step(hooks.stepSeconds, hooks.autopilot(flight.state));
        guard += 1;
      }
      hooks.recordResult();
      hooks.setScreen(SCREEN_OVER);
    }
    hooks.drawNow();
    window.__shotReady = true;
  }

  run();
}
