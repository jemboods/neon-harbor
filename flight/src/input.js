// Keyboard and mouse input. Held keys give continuous control (pitch, roll, throttle);
// one-shot presses (confirm, pause, toggles, menu steps) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never counted twice.
// The mouse steers too: its offset from the window's centre is a pitch and roll demand,
// and a click confirms.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_GUSTS = 4;
export const ACTION_MUTE = 8;
export const ACTION_UP = 16;
export const ACTION_DOWN = 32;
export const ACTION_FLAPS = 64;
export const ACTION_VIEW = 256;
export const ACTION_BACK = 512;

const PITCH_KEYS_UP = new Set(['ArrowDown']);
const PITCH_KEYS_DOWN = new Set(['ArrowUp']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['KeyW', 'KeyR']);
const THROTTLE_DOWN = new Set(['KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP']);
const BACK = new Set(['Escape']);
const UP = new Set(['ArrowUp']);
const DOWN = new Set(['ArrowDown']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyX') {
      if (!event.repeat) actions |= ACTION_GUSTS;
    } else if (event.code === 'KeyF') {
      if (!event.repeat) actions |= ACTION_FLAPS;
    } else if (event.code === 'KeyC') {
      if (!event.repeat) actions |= ACTION_VIEW;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (BACK.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BACK;
    } else if (UP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_UP;
      held.add(event.code); // the arrow keys pitch the plane too, while held
    } else if (DOWN.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DOWN;
      held.add(event.code);
    } else if (
      PITCH_KEYS_UP.has(event.code) || PITCH_KEYS_DOWN.has(event.code) ||
      ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)
    ) {
      held.add(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => held.clear());
  window.addEventListener('pointermove', (event) => {
    mouseSeen = true;
    mouseX = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    mouseY = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function anyHeld(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Pitch demand, -1 (nose down) to 1 (nose up): keys, or the mouse's height. */
    pitch() {
      let value = (anyHeld(PITCH_KEYS_UP) ? 1 : 0) - (anyHeld(PITCH_KEYS_DOWN) ? 1 : 0);
      if (value === 0 && mouseSeen) value = -mouseY;
      return Math.max(-1, Math.min(1, value));
    },
    /** Roll demand, -1 (bank left) to 1 (bank right): keys, or the mouse's offset. */
    roll() {
      let value = (anyHeld(ROLL_RIGHT) ? 1 : 0) - (anyHeld(ROLL_LEFT) ? 1 : 0);
      if (value === 0 && mouseSeen) value = mouseX;
      return Math.max(-1, Math.min(1, value));
    },
    /** Throttle lever movement a second while its keys are held. */
    throttleDelta() {
      return (anyHeld(THROTTLE_UP) ? 0.55 : 0) - (anyHeld(THROTTLE_DOWN) ? 0.55 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
