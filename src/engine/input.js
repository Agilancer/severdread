// Unified input state fed by keyboard/mouse (pointer lock) and the touch UI.
export const input = {
  move: { x: 0, y: 0 },        // x strafe right, y forward
  lookDX: 0, lookDY: 0,        // accumulated look delta (radians) since last frame
  fire: false,
  jumpHeld: false,
  pressed: new Set(),          // one-frame actions: jump, dash, use, menu, pause, weapon0..3, next, prev, swap
  keys: new Set(),
  mode: 'keyboard',            // 'keyboard' | 'touch'
  locked: false,
  settings: { sens: 1, touchSens: 1, invertY: false },
};

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', KeyD: 'right', ArrowLeft: 'turnL', ArrowRight: 'turnR',
};

export function press(action) { input.pressed.add(action); }
export function consume(action) { if (input.pressed.has(action)) { input.pressed.delete(action); return true; } return false; }
export function endFrame() { input.pressed.clear(); input.lookDX = 0; input.lookDY = 0; }

let canvasEl = null;
let uiBlocking = () => false;

export function initInput(canvas, opts = {}) {
  canvasEl = canvas;
  uiBlocking = opts.uiBlocking || uiBlocking;
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    input.mode = 'keyboard';
    const k = e.code;
    if (!input.keys.has(k)) {
      if (k === 'Space') press('jump');
      if (k === 'ShiftLeft' || k === 'ShiftRight') press('dash');
      if (k === 'KeyE' || k === 'KeyF' || k === 'Enter') press('use');
      if (k === 'Tab' || k === 'KeyI') press('menu');
      // Safari delivers Esc to the page while pointer-locked; the unlock handler pauses then
      if ((k === 'Escape' && !input.locked) || k === 'KeyP') press('pause');
      if (k === 'KeyQ') press('swap');
      if (k === 'KeyM') press('map');
      if (k >= 'Digit1' && k <= 'Digit4') press('weapon' + (k.charCodeAt(5) - 49));
    }
    input.keys.add(k);
    if (k === 'Space') input.jumpHeld = true;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !uiBlocking()) e.preventDefault();
    if (k === 'Tab') e.preventDefault();
    updateMove();
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (e.code === 'Space') input.jumpHeld = false;
    updateMove();
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.fire = false; input.jumpHeld = false; updateMove(); });

  canvas.addEventListener('mousedown', (e) => {
    if (input.mode === 'touch') return;
    if (!input.locked && opts.wantLock && opts.wantLock()) { requestLock(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) press('dash');
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    const s = 0.0022 * input.settings.sens;
    input.lookDX += e.movementX * s;
    input.lookDY += e.movementY * s * (input.settings.invertY ? 1 : -1);
  });
  window.addEventListener('wheel', (e) => {
    if (!input.locked) return;
    press(e.deltaY > 0 ? 'next' : 'prev');
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked;
    input.locked = document.pointerLockElement === canvasEl;
    if (was && !input.locked) { input.fire = false; if (opts.onUnlock) opts.onUnlock(); }
  });
}

export function requestLock() {
  if (!canvasEl || input.mode === 'touch') return;
  try {
    const p = canvasEl.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { const q = canvasEl.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* ignore */ } });
  } catch (e) {
    try { canvasEl.requestPointerLock(); } catch (e2) { /* ignore */ }
  }
}
export function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

function updateMove() {
  const k = input.keys;
  if (input.mode !== 'keyboard') return;
  input.move.y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  input.move.x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
}

// keyboard turning with arrow keys (for players without a mouse)
export function keyboardTurn(dt) {
  if (input.keys.has('ArrowLeft')) input.lookDX -= 2.4 * dt;
  if (input.keys.has('ArrowRight')) input.lookDX += 2.4 * dt;
}
void KEYMAP;
