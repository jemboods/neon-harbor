// Keyboard state: held keys for movement, one-shot presses for actions.
const held = new Set();
const pressed = new Set();
let wheelDelta = 0;

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(e.code);
    pressed.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); pressed.clear(); });
  window.addEventListener('wheel', (e) => { wheelDelta += Math.sign(e.deltaY); }, { passive: true });
  window.addEventListener('mousedown', () => { pressed.add('Mouse0'); held.add('Mouse0'); });
  window.addEventListener('mouseup', () => held.delete('Mouse0'));
}
export const down = (code) => held.has(code);
/** True once per physical press; consumes it. */
export function hit(code) {
  if (!pressed.has(code)) return false;
  pressed.delete(code);
  return true;
}
export function takeWheel() {
  const d = wheelDelta;
  wheelDelta = 0;
  return d;
}
/** Movement axes from WASD/arrows: {x: strafe, z: forward} in -1..1. */
export function axes() {
  const x = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
  const z = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0);
  return { x, z };
}
