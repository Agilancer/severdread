// SEVERDREAD entry point.
import { Renderer } from './engine/renderer.js';
import { TextureStore, loadJSON } from './engine/assets.js';
import { initInput, input, requestLock } from './engine/input.js';
import { audio } from './engine/audio.js';
import { Content } from './game/content.js';
import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/ui.js';
import { TouchControls } from './ui/touch.js';

const $ = (id) => document.getElementById(id);
const bootStatus = (t, p) => { $('boot-status').textContent = t; if (p !== undefined) $('boot-bar-fill').style.width = Math.round(p * 100) + '%'; };

async function boot() {
  const glCanvas = $('gl');
  let renderer;
  try {
    renderer = new Renderer(glCanvas);
  } catch (e) {
    bootStatus('WEBGL2 NOT AVAILABLE - ' + e.message);
    throw e;
  }
  bootStatus('LOADING FONTS...', 0.05);
  try { await Promise.race([Promise.all(['10px PressStart', '10px Silkscreen', '10px VT323'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts optional */ }
  bootStatus('LOADING MANIFEST...', 0.1);
  let manifest = null;
  try { manifest = await loadJSON('assets/manifest.json'); } catch (e) { console.warn('no manifest, using placeholders only', e); }
  const store = new TextureStore(renderer);
  const content = new Content(renderer, store, manifest);
  await content.init((p) => bootStatus('LOADING ART...', 0.1 + p * 0.8));
  // warm the most common sprites
  bootStatus('WARMING UP...', 0.92);
  await Promise.race([content.preloadMonsters(['piston_monk']), new Promise((r) => setTimeout(r, 3000))]);

  const hud = new HUD($('hud'), content);
  const ui = new UI($('ui'));
  const touch = new TouchControls($('touch'));
  const game = new Game(renderer, store, content, hud, ui, touch);
  ui.bind(game);
  window.SEVERDREAD = game; // handy for debugging from the console

  initInput(glCanvas, {
    uiBlocking: () => game.state !== 'playing',
    wantLock: () => game.state === 'playing',
    onUnlock: () => { if (game.state === 'playing' && input.mode === 'keyboard') game.pause(); },
  });
  game.events.on('weapon', (i) => touch.setWeapon(i));
  game.events.on('enter', () => touch.setVisible(input.mode === 'touch'));
  window.addEventListener('touchstart', () => { if (game.state === 'playing' || game.state === 'menu') touch.setVisible(true); }, { passive: true });
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  // ------------------------------------------------------------- sizing
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const portrait = h > w * 1.05 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    $('rotate').classList.toggle('hidden', !portrait);
    const res = Math.min(game.settings.res, Math.round(h * dpr));
    renderer.resize(w, h, dpr, res);
    hud.resize(w, h, dpr);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  let lastRes = game.settings.res;

  // ------------------------------------------------------------- loop
  let last = performance.now();
  let fpsT = 0, frames = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game.settings.res !== lastRes) { lastRes = game.settings.res; resize(); }
    try {
      game.update(dt);
      if (game.world && game.state !== 'title') game.render();
      hud.draw(game, dt);
      touch.placeSlots(hud.slotRects);
    } catch (e) {
      console.error(e);
    }
    frames++; fpsT += dt;
    if (fpsT > 1) { game.fps = frames / fpsT; frames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  bootStatus('READY', 1);
  $('boot').classList.add('hidden');
  ui.showTitle();
  // clicking the canvas while playing re-captures the mouse
  glCanvas.addEventListener('click', () => { if (game.state === 'playing' && input.mode === 'keyboard' && !input.locked) requestLock(); });
  // keep the UI from scrolling the page on iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('boot-status');
  if (s) s.textContent = 'FAILED TO START: ' + e.message;
});
