// input.js — keyboard + mouse state for Azahar Heat. One job: turn raw DOM events into a
// clean `keys` set, a mouse-orbit delta, and edge-triggered "pressed" queries the other
// modules poll each frame. No game logic lives here.

export const keys = new Set();
export const mouse = { dx: 0, dy: 0, down: false, downEdge: false };
const pressedSet = new Set();
let attached = false;

const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function initInput(canvas) {
  if (attached) return;
  attached = true;
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) pressedSet.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  canvas.addEventListener('mousemove', (e) => {
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { if (!mouse.down) mouse.downEdge = true; mouse.down = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function pressed(code) { return pressedSet.has(code); }
export function anyPressed(codes) { return codes.some((c) => pressedSet.has(c)); }
export function endFrameInput() {
  pressedSet.clear();
  mouse.dx = 0; mouse.dy = 0; mouse.downEdge = false;
}

// Movement axes in camera-relative form are computed by the player/vehicle modules;
// here we only expose the raw intents.
export function moveAxis() {
  let fwd = 0, side = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) side -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) side += 1;
  return { fwd, side };
}
export const sprintHeld = () => keys.has('ShiftLeft') || keys.has('ShiftRight');
export const brakeHeld = () => keys.has('Space');
