// Keyboard and pointer input. Held keys live in a set the loop reads every
// step; one-shot presses are queued in a second set and consumed once, so a
// tap between frames is never lost and never counted twice.

export function createInput() {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, pressed: false };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Tab') event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    down.add(event.code);
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  // A key released while the tab is hidden never sends keyup: drop everything on blur.
  window.addEventListener('blur', () => {
    down.clear();
    mouse.down = false;
  });
  window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.pressed = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** True while the key is held. */
    isDown: (code) => down.has(code),
    /** True only on the step the key went down; consumes the press. */
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    /** Peek at a queued press without consuming it. */
    peekPressed: (code) => pressed.has(code),
    /** Call once per rendered frame, after the fixed steps have read presses. */
    endFrame() {
      pressed.clear();
      mouse.pressed = false;
    },
    /** Forward/back/strafe axes from WASD and the arrow keys. */
    moveAxis() {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const z = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
      return { x, z };
    },
  };
}
