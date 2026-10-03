// Procedural audio: every sound effect and the music are synthesised with
// WebAudio, so the game ships with zero audio files. Real samples can be
// dropped in later via `registerSample(name, url)`.
import { fx } from '../core/rng.js';

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.vol = { master: 0.8, sfx: 0.9, music: 0.45 };
    this.samples = new Map();
    this.music = null;
    this.lastPlay = new Map();
  }

  // must be called from a user gesture (iOS)
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.applyVolumes();
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.distCurve = makeDistortion(40);
    this.hardCurve = makeDistortion(200);
    // silent buffer kick for iOS
    const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
    for (const [name, url] of this.samples) if (typeof url === 'string') this._loadSample(name, url);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfxBus.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music;
  }

  registerSample(name, url) { this.samples.set(name, url); if (this.ctx) this._loadSample(name, url); }
  async _loadSample(name, url) {
    try {
      const r = await fetch(url); const ab = await r.arrayBuffer();
      this.samples.set(name, await this.ctx.decodeAudioData(ab));
    } catch (e) { console.warn('sample failed', name, e); }
  }

  // ------------------------------------------------------------ primitives
  _out(gain = 1, pan = 0) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.sfxBus); }
    else g.connect(this.sfxBus);
    return g;
  }
  _noise(dest, t, dur, { type = 'lowpass', freq = 2000, freqEnd, q = 1, gain = 1, attack = 0.002 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  _tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd, gain = 0.5, attack = 0.003, dist = false, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (dist) { const ws = ctx.createWaveShaper(); ws.curve = dist === 'hard' ? this.hardCurve : this.distCurve; o.connect(ws); node = ws; }
    node.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ sfx
  // opts: {volume, pitch, dist (world distance), pan}
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    // rate-limit spammy sounds
    const minGap = RATE_LIMIT[name] || 0.02;
    const last = this.lastPlay.get(name) || 0;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);
    let vol = opts.volume ?? 1;
    if (opts.dist !== undefined) vol *= 1 / (1 + opts.dist * opts.dist * 0.012);
    if (vol < 0.02) return;
    const sample = this.samples.get(name);
    if (sample && typeof sample !== 'string') {
      const s = this.ctx.createBufferSource(); s.buffer = sample; s.playbackRate.value = opts.pitch || 1;
      s.connect(this._out(vol, opts.pan)); s.start(now); return;
    }
    const fn = SFX[name];
    if (fn) fn(this, now, this._out(vol, opts.pan), opts.pitch || 1);
  }

  // ------------------------------------------------------------ music
  setMusic(mood, seed = 1) {
    if (!this.ctx) { this.pendingMood = [mood, seed]; return; }
    if (this.music && this.music.mood === mood) return;
    this.stopMusic();
    this.music = new MusicPlayer(this, mood, seed);
    this.music.start();
  }
  stopMusic() { if (this.music) { this.music.stop(); this.music = null; } }
  duckMusic(amount, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.vol.music * amount, t + 0.1);
    g.linearRampToValueAtTime(this.vol.music, t + time);
  }

  levelUpFanfare() {
    if (!this.ctx) return;
    this.duckMusic(0.15, 3.6);
    const t0 = this.ctx.currentTime + 0.02;
    const out = this._out(0.9);
    const root = 110; // A2
    const chords = [[0, 7, 12], [8, 15, 20], [10, 17, 22], [12, 19, 24], [12, 19, 24]];
    const times = [0, 0.42, 0.84, 1.26, 1.7];
    const durs = [0.4, 0.4, 0.4, 0.42, 1.8];
    chords.forEach((c, k) => {
      for (const semis of c) for (const det of [-9, 0, 9]) {
        this._tone(out, t0 + times[k], durs[k], { type: 'sawtooth', freq: root * Math.pow(2, semis / 12), gain: 0.06, dist: 'hard', detune: det, attack: 0.005 });
      }
      // choir-ish pad an octave up
      this._tone(out, t0 + times[k], durs[k] + 0.3, { type: 'triangle', freq: root * 4 * Math.pow(2, c[1] / 12), gain: 0.05, attack: 0.08 });
      // drums
      SFX._kick(this, t0 + times[k], out, 1.2);
      if (k % 2) SFX._snare(this, t0 + times[k] + 0.21, out, 1.0);
    });
    for (let i = 0; i < 8; i++) SFX._snare(this, t0 + 1.26 + i * 0.055, out, 0.5 + i * 0.06); // roll
    SFX._crash(this, t0 + 1.7, out, 1.2);
    this._tone(out, t0 + 1.7, 2.2, { type: 'sine', freq: 55, freqEnd: 40, gain: 0.5 });
  }
}

function makeDistortion(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
  return c;
}

const RATE_LIMIT = { smg: 0.045, minigun: 0.035, flame: 0.08, zap: 0.06, hit: 0.03, hit_metal: 0.03, pickup_credits: 0.05, footstep: 0.18, explosion: 0.05, monster_pain: 0.12 };

// Sound effect recipes: (audio, time, destination, pitch)
const SFX = {
  _kick(a, t, o, v = 1) { a._tone(o, t, 0.25, { freq: 140, freqEnd: 42, gain: 0.9 * v }); a._noise(o, t, 0.02, { type: 'highpass', freq: 3000, gain: 0.2 * v }); },
  _snare(a, t, o, v = 1) { a._noise(o, t, 0.16, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.5 * v }); a._tone(o, t, 0.08, { type: 'triangle', freq: 220, freqEnd: 140, gain: 0.3 * v }); },
  _hat(a, t, o, v = 1) { a._noise(o, t, 0.04, { type: 'highpass', freq: 8000, gain: 0.18 * v }); },
  _crash(a, t, o, v = 1) { a._noise(o, t, 1.4, { type: 'highpass', freq: 5000, gain: 0.35 * v }); },
  _gun(a, t, o, p, { body = 900, len = 0.18, low = 90, crack = 0.5 } = {}) {
    a._noise(o, t, len, { type: 'lowpass', freq: body * p, freqEnd: 200, gain: 0.9 });
    a._noise(o, t, 0.03, { type: 'highpass', freq: 2500, gain: crack });
    a._tone(o, t, len * 0.8, { freq: low * p * 2, freqEnd: low * p, gain: 0.6 });
  },
  pistol(a, t, o, p) { SFX._gun(a, t, o, p, { body: 1600, len: 0.16, low: 110 }); },
  smg(a, t, o, p) { SFX._gun(a, t, o, p * (0.95 + Math.random() * 0.1), { body: 2200, len: 0.09, low: 140, crack: 0.35 }); },
  rifle(a, t, o, p) { SFX._gun(a, t, o, p, { body: 1800, len: 0.14, low: 100, crack: 0.6 }); },
  minigun(a, t, o, p) { SFX._gun(a, t, o, p * (0.9 + Math.random() * 0.2), { body: 2600, len: 0.06, low: 160, crack: 0.3 }); },
  shotgun(a, t, o, p) { SFX._gun(a, t, o, p, { body: 1100, len: 0.42, low: 70, crack: 0.8 }); a._noise(o, t + 0.28, 0.08, { type: 'bandpass', freq: 900, gain: 0.25 }); },
  sshotgun(a, t, o, p) { SFX._gun(a, t, o, p * 0.85, { body: 900, len: 0.6, low: 55, crack: 1 }); },
  rocket(a, t, o, p) { a._noise(o, t, 0.6, { type: 'bandpass', freq: 700 * p, freqEnd: 300, q: 1, gain: 0.7, attack: 0.03 }); a._tone(o, t, 0.4, { type: 'sawtooth', freq: 90, freqEnd: 50, gain: 0.25, dist: true }); },
  grenade(a, t, o, p) { a._tone(o, t, 0.15, { freq: 180 * p, freqEnd: 70, gain: 0.7 }); a._noise(o, t, 0.12, { type: 'lowpass', freq: 900, gain: 0.5 }); },
  plasma(a, t, o, p) { a._tone(o, t, 0.16, { type: 'square', freq: 1200 * p, freqEnd: 300, gain: 0.25 }); a._tone(o, t, 0.12, { type: 'sine', freq: 600 * p, freqEnd: 1800, gain: 0.2 }); },
  rail(a, t, o, p) { a._tone(o, t, 0.6, { type: 'sawtooth', freq: 2400 * p, freqEnd: 120, gain: 0.35 }); a._noise(o, t, 0.5, { type: 'highpass', freq: 3000, freqEnd: 600, gain: 0.4 }); a._tone(o, t, 0.5, { freq: 70, freqEnd: 40, gain: 0.6 }); },
  flame(a, t, o, p) { a._noise(o, t, 0.2, { type: 'bandpass', freq: 600 * p, q: 0.6, gain: 0.4, attack: 0.03 }); },
  zap(a, t, o, p) { a._tone(o, t, 0.08, { type: 'sawtooth', freq: 300 * p + Math.random() * 400, freqEnd: 2000, gain: 0.15, dist: true }); a._noise(o, t, 0.06, { type: 'highpass', freq: 4000, gain: 0.15 }); },
  disc(a, t, o, p) { a._tone(o, t, 0.25, { type: 'triangle', freq: 900 * p, freqEnd: 1400, gain: 0.3 }); a._noise(o, t, 0.2, { type: 'bandpass', freq: 3000, gain: 0.2 }); },
  swing(a, t, o, p) { a._noise(o, t, 0.22, { type: 'bandpass', freq: 600 * p, freqEnd: 2400, q: 2, gain: 0.5, attack: 0.04 }); },
  explosion(a, t, o, p) {
    a._noise(o, t, 1.1, { type: 'lowpass', freq: 1500 * p, freqEnd: 60, gain: 1.0 });
    a._tone(o, t, 0.9, { freq: 90 * p, freqEnd: 28, gain: 0.9 });
    a._noise(o, t, 0.05, { type: 'highpass', freq: 2000, gain: 0.5 });
  },
  hit(a, t, o, p) { a._noise(o, t, 0.07, { type: 'bandpass', freq: 500 * p, q: 1.5, gain: 0.45 }); a._tone(o, t, 0.06, { freq: 160 * p, freqEnd: 80, gain: 0.3 }); },
  hit_metal(a, t, o, p) { a._tone(o, t, 0.12, { type: 'square', freq: 1800 * p, freqEnd: 900, gain: 0.12 }); a._noise(o, t, 0.06, { type: 'highpass', freq: 3000, gain: 0.25 }); },
  crit(a, t, o, p) { a._tone(o, t, 0.12, { type: 'square', freq: 1400 * p, freqEnd: 2800, gain: 0.12 }); a._noise(o, t, 0.1, { type: 'bandpass', freq: 1200, gain: 0.4 }); },
  wall_hit(a, t, o, p) { a._noise(o, t, 0.05, { type: 'bandpass', freq: 2500 * p, q: 2, gain: 0.18 }); },
  enemy_gun(a, t, o, p) { SFX._gun(a, t, o, p * 0.8, { body: 1300, len: 0.12, low: 90, crack: 0.3 }); },
  zap_enemy(a, t, o, p) { a._tone(o, t, 0.35, { type: 'sawtooth', freq: 220 * p, freqEnd: 1600, gain: 0.18, dist: true }); a._noise(o, t, 0.3, { type: 'bandpass', freq: 2500, q: 3, gain: 0.25 }); },
  fireball(a, t, o, p) { a._noise(o, t, 0.5, { type: 'lowpass', freq: 1200 * p, freqEnd: 300, gain: 0.5, attack: 0.05 }); },
  spit(a, t, o, p) { a._noise(o, t, 0.2, { type: 'bandpass', freq: 900 * p, freqEnd: 300, q: 3, gain: 0.5 }); a._tone(o, t, 0.25, { freq: 300 * p, freqEnd: 120, gain: 0.3 }); },
  slam(a, t, o, p) { a._tone(o, t, 0.35, { freq: 120 * p, freqEnd: 35, gain: 0.9 }); a._noise(o, t, 0.3, { type: 'lowpass', freq: 800, freqEnd: 100, gain: 0.7 }); a._tone(o, t, 0.15, { type: 'square', freq: 400, freqEnd: 200, gain: 0.08 }); },
  boss_slam(a, t, o, p) { SFX.slam(a, t, o, p * 0.7); SFX.explosion(a, t, o, 0.6); },
  bite(a, t, o, p) { a._noise(o, t, 0.08, { type: 'bandpass', freq: 1400 * p, q: 2, gain: 0.5 }); },
  robot_alert(a, t, o, p) { a._tone(o, t, 0.12, { type: 'square', freq: 880 * p, gain: 0.12 }); a._tone(o, t + 0.13, 0.18, { type: 'square', freq: 660 * p, gain: 0.12 }); },
  demon_alert(a, t, o, p) { a._tone(o, t, 0.7, { type: 'sawtooth', freq: 90 * p, freqEnd: 60, gain: 0.3, dist: true, attack: 0.08 }); a._noise(o, t, 0.6, { type: 'bandpass', freq: 400, q: 1, gain: 0.3, attack: 0.08 }); },
  chitter(a, t, o, p) { for (let i = 0; i < 5; i++) a._tone(o, t + i * 0.045, 0.03, { type: 'square', freq: (2200 + Math.random() * 800) * p, gain: 0.08 }); },
  alien(a, t, o, p) { a._tone(o, t, 0.5, { type: 'triangle', freq: 400 * p, freqEnd: 900, gain: 0.2 }); a._tone(o, t, 0.5, { type: 'triangle', freq: 420 * p, freqEnd: 300, gain: 0.15 }); },
  monster_pain(a, t, o, p) { a._noise(o, t, 0.15, { type: 'bandpass', freq: 700 * p, q: 2, gain: 0.35 }); },
  monster_death(a, t, o, p) { a._tone(o, t, 0.6, { type: 'sawtooth', freq: 200 * p, freqEnd: 40, gain: 0.25, dist: true }); a._noise(o, t, 0.5, { type: 'lowpass', freq: 1200, freqEnd: 150, gain: 0.5 }); },
  robot_death(a, t, o, p) { a._tone(o, t, 0.5, { type: 'square', freq: 600 * p, freqEnd: 50, gain: 0.15 }); SFX.explosion(a, t, o, 1.6); },
  player_hurt(a, t, o, p) { a._tone(o, t, 0.2, { type: 'sawtooth', freq: 180 * p, freqEnd: 110, gain: 0.25 }); a._noise(o, t, 0.15, { type: 'bandpass', freq: 900, gain: 0.3 }); },
  player_death(a, t, o, p) { a._tone(o, t, 1.6, { type: 'sawtooth', freq: 160 * p, freqEnd: 30, gain: 0.35, dist: true }); a._noise(o, t, 1.2, { type: 'lowpass', freq: 800, freqEnd: 60, gain: 0.6 }); },
  jump(a, t, o, p) { a._tone(o, t, 0.1, { type: 'triangle', freq: 220 * p, freqEnd: 420, gain: 0.12 }); },
  land(a, t, o, p) { a._noise(o, t, 0.08, { type: 'lowpass', freq: 500 * p, gain: 0.4 }); },
  dash(a, t, o, p) { a._noise(o, t, 0.22, { type: 'bandpass', freq: 1200 * p, freqEnd: 400, q: 1.2, gain: 0.45, attack: 0.01 }); },
  footstep(a, t, o, p) { a._noise(o, t, 0.05, { type: 'lowpass', freq: 400 * p, gain: 0.12 }); },
  pickup_item(a, t, o, p) { a._tone(o, t, 0.12, { type: 'square', freq: 660 * p, gain: 0.12 }); a._tone(o, t + 0.08, 0.16, { type: 'square', freq: 990 * p, gain: 0.12 }); },
  pickup_rare(a, t, o, p) { [0, 4, 7, 12].forEach((s, i) => a._tone(o, t + i * 0.07, 0.25, { type: 'triangle', freq: 523 * Math.pow(2, s / 12) * p, gain: 0.18 })); },
  pickup_legendary(a, t, o, p) { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => a._tone(o, t + i * 0.06, 0.5, { type: 'sawtooth', freq: 392 * Math.pow(2, s / 12) * p, gain: 0.1 })); SFX._crash(a, t + 0.4, o, 0.5); },
  pickup_credits(a, t, o, p) { a._tone(o, t, 0.08, { type: 'square', freq: 1320 * p, gain: 0.08 }); a._tone(o, t + 0.05, 0.12, { type: 'square', freq: 1760 * p, gain: 0.08 }); },
  pickup_reagent(a, t, o, p) { a._tone(o, t, 0.15, { type: 'sine', freq: 880 * p, freqEnd: 1320, gain: 0.15 }); },
  pickup_key(a, t, o, p) { [0, 7, 12, 19].forEach((s, i) => a._tone(o, t + i * 0.06, 0.2, { type: 'square', freq: 440 * Math.pow(2, s / 12) * p, gain: 0.1 })); },
  pickup_orb(a, t, o, p) { a._tone(o, t, 0.4, { type: 'sine', freq: 300 * p, freqEnd: 1200, gain: 0.25 }); a._tone(o, t, 0.4, { type: 'triangle', freq: 600 * p, freqEnd: 2400, gain: 0.1 }); },
  door_open(a, t, o, p) { a._noise(o, t, 0.9, { type: 'lowpass', freq: 300 * p, gain: 0.4, attack: 0.1 }); a._tone(o, t, 0.9, { type: 'sawtooth', freq: 55 * p, gain: 0.08, attack: 0.1 }); },
  door_locked(a, t, o, p) { a._tone(o, t, 0.15, { type: 'square', freq: 200 * p, gain: 0.15 }); a._tone(o, t + 0.18, 0.2, { type: 'square', freq: 150 * p, gain: 0.15 }); },
  chest_open(a, t, o, p) { a._noise(o, t, 0.3, { type: 'bandpass', freq: 800 * p, gain: 0.3 }); [0, 5, 9, 12].forEach((s, i) => a._tone(o, t + 0.15 + i * 0.07, 0.3, { type: 'triangle', freq: 660 * Math.pow(2, s / 12), gain: 0.14 })); },
  teleport(a, t, o, p) { a._tone(o, t, 1.2, { type: 'sawtooth', freq: 80 * p, freqEnd: 1600, gain: 0.2, attack: 0.2 }); a._noise(o, t, 1.2, { type: 'bandpass', freq: 400, freqEnd: 6000, q: 2, gain: 0.3, attack: 0.3 }); },
  enemy_teleport(a, t, o, p) { a._tone(o, t, 0.25, { type: 'sine', freq: 1800 * p, freqEnd: 200, gain: 0.18 }); },
  portal(a, t, o, p) { a._tone(o, t, 2.0, { type: 'sine', freq: 110 * p, freqEnd: 220, gain: 0.3, attack: 0.5 }); a._tone(o, t, 2.0, { type: 'triangle', freq: 330 * p, freqEnd: 660, gain: 0.12, attack: 0.5 }); },
  ui_click(a, t, o, p) { a._tone(o, t, 0.04, { type: 'square', freq: 1000 * p, gain: 0.06 }); },
  ui_buy(a, t, o, p) { SFX.pickup_credits(a, t, o, p * 0.8); SFX.pickup_credits(a, t + 0.1, o, p); },
  ui_error(a, t, o, p) { a._tone(o, t, 0.2, { type: 'square', freq: 120 * p, gain: 0.12 }); },
  upgrade(a, t, o, p) { a._tone(o, t, 0.08, { type: 'square', freq: 300, gain: 0.15, dist: true }); a._noise(o, t, 0.1, { type: 'highpass', freq: 3000, gain: 0.3 }); [0, 4, 7, 12, 16].forEach((s, i) => a._tone(o, t + 0.12 + i * 0.06, 0.3, { type: 'triangle', freq: 523 * Math.pow(2, s / 12) * p, gain: 0.15 })); },
  boss_roar(a, t, o, p) { a._tone(o, t, 1.4, { type: 'sawtooth', freq: 70 * p, freqEnd: 45, gain: 0.45, dist: 'hard', attack: 0.15 }); a._noise(o, t, 1.3, { type: 'bandpass', freq: 300, q: 0.7, gain: 0.5, attack: 0.15 }); },
  shockwave(a, t, o, p) { a._tone(o, t, 0.8, { freq: 60 * p, freqEnd: 30, gain: 0.8 }); a._noise(o, t, 0.6, { type: 'lowpass', freq: 600, freqEnd: 80, gain: 0.5 }); },
  barrel(a, t, o, p) { SFX.explosion(a, t, o, p * 1.2); },
};

// ------------------------------------------------------------ music
const MOODS = {
  industrial: { bpm: 118, scale: [0, 1, 3, 5, 7, 8, 10], root: 40, drums: 'rock', bass: 'driving', lead: 'chug' },
  hell: { bpm: 142, scale: [0, 1, 4, 5, 7, 8, 10], root: 38, drums: 'metal', bass: 'driving', lead: 'chug' },
  cyber: { bpm: 128, scale: [0, 2, 3, 5, 7, 8, 10], root: 45, drums: 'four', bass: 'arp', lead: 'arp' },
  ruins: { bpm: 96, scale: [0, 2, 3, 5, 7, 8, 10], root: 40, drums: 'slow', bass: 'slow', lead: 'pad' },
  caves: { bpm: 78, scale: [0, 1, 3, 5, 6, 8, 10], root: 36, drums: 'sparse', bass: 'drone', lead: 'pad' },
  castle: { bpm: 108, scale: [0, 2, 3, 5, 7, 8, 11], root: 38, drums: 'rock', bass: 'slow', lead: 'organ' },
  desert: { bpm: 96, scale: [0, 1, 4, 5, 7, 8, 10], root: 40, drums: 'tribal', bass: 'slow', lead: 'arp' },
  mountain: { bpm: 90, scale: [0, 2, 3, 5, 7, 9, 10], root: 38, drums: 'slow', bass: 'drone', lead: 'pad' },
  ethereal: { bpm: 72, scale: [0, 2, 4, 7, 9], root: 45, drums: 'none', bass: 'drone', lead: 'pad' },
  metal: { bpm: 168, scale: [0, 1, 3, 5, 7, 8, 10], root: 38, drums: 'metal', bass: 'driving', lead: 'chug' },
  backrooms: { bpm: 60, scale: [0, 1, 6, 7], root: 48, drums: 'none', bass: 'hum', lead: 'none' },
  speed: { bpm: 156, scale: [0, 2, 3, 5, 7, 8, 10], root: 40, drums: 'four', bass: 'driving', lead: 'chug' },
  military: { bpm: 112, scale: [0, 2, 3, 5, 7, 8, 10], root: 38, drums: 'march', bass: 'driving', lead: 'chug' },
  hub: { bpm: 84, scale: [0, 2, 3, 7, 8], root: 45, drums: 'sparse', bass: 'drone', lead: 'pad' },
};

class MusicPlayer {
  constructor(audio, mood, seed) {
    this.a = audio; this.mood = mood; this.m = MOODS[mood] || MOODS.industrial;
    this.step = 0; this.timer = null; this.seed = seed;
    const s = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
    this.prog = [0, s(2) ? 5 : 3, s(2) ? 6 : 4, s(3) ? 4 : 5];
    this.riff = Array.from({ length: 16 }, () => (s(3) ? 0 : this.m.scale[s(this.m.scale.length)]));
    this.out = audio.ctx.createGain(); this.out.gain.value = 0.55; this.out.connect(audio.musicBus);
  }
  start() {
    const ctx = this.a.ctx;
    this.next = ctx.currentTime + 0.1;
    const spb = 60 / this.m.bpm / 4; // 16th notes
    this.timer = setInterval(() => {
      while (this.next < ctx.currentTime + 0.15) { this.tick(this.next, spb); this.next += spb; this.step++; }
    }, 30);
  }
  stop() {
    clearInterval(this.timer);
    const t = this.a.ctx.currentTime;
    this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => this.out.disconnect(), 800);
  }
  note(deg, oct = 0) { const sc = this.m.scale; const i = ((deg % sc.length) + sc.length) % sc.length; return 440 * Math.pow(2, (this.m.root + sc[i] + 12 * (oct + Math.floor(deg / sc.length)) - 69) / 12); }
  tick(t, spb) {
    const a = this.a, o = this.out, s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
    const chordRoot = this.prog[bar];
    const d = this.m.drums;
    if (d !== 'none') {
      const kickPat = { rock: [0, 8, 10], metal: [0, 2, 4, 6, 8, 10, 12, 14], four: [0, 4, 8, 12], slow: [0, 10], sparse: [0], tribal: [0, 3, 6, 10, 12], march: [0, 4, 8, 12] }[d] || [0, 8];
      const snarePat = { rock: [4, 12], metal: [4, 12], four: [4, 12], slow: [8], sparse: [], tribal: [8, 14], march: [4, 12, 14] }[d] || [4, 12];
      if (kickPat.includes(s)) SFX._kick(a, t, o, 0.8);
      if (snarePat.includes(s)) SFX._snare(a, t, o, 0.6);
      if (d !== 'sparse' && d !== 'slow' && s % 2 === 0) SFX._hat(a, t, o, 0.5);
      if (d === 'sparse' && s === 8 && bar % 2) SFX._hat(a, t, o, 0.6);
      if (s === 0 && bar === 0 && this.step % 64 === 0) SFX._crash(a, t, o, 0.35);
    }
    const b = this.m.bass;
    const root = this.note(chordRoot, -1);
    if (b === 'driving' && s % 2 === 0) a._tone(o, t, spb * 1.8, { type: 'sawtooth', freq: root * (this.riff[s] ? Math.pow(2, this.riff[s] / 12) : 1), gain: 0.12, dist: true });
    if (b === 'arp') a._tone(o, t, spb * 0.9, { type: 'square', freq: this.note(chordRoot + [0, 2, 4, 7][s % 4], 0), gain: 0.05 });
    if (b === 'slow' && s % 8 === 0) a._tone(o, t, spb * 7, { type: 'sawtooth', freq: root, gain: 0.08, dist: true });
    if ((b === 'drone' || b === 'hum') && s === 0) a._tone(o, t, spb * 16, { type: b === 'hum' ? 'sawtooth' : 'triangle', freq: b === 'hum' ? 60 : root, gain: b === 'hum' ? 0.025 : 0.1, attack: 0.5 });
    const l = this.m.lead;
    if (l === 'chug' && (s === 0 || s === 3 || s === 6 || s === 10 || s === 12) && bar !== 3) {
      for (const semis of [0, 7, 12]) a._tone(o, t, spb * 1.5, { type: 'sawtooth', freq: root * 2 * Math.pow(2, semis / 12), gain: 0.03, dist: 'hard' });
    }
    if (l === 'pad' && s === 0) for (const k of [0, 2, 4]) a._tone(o, t, spb * 16, { type: 'triangle', freq: this.note(chordRoot + k, 1), gain: 0.035, attack: 1.2 });
    if (l === 'organ' && s % 8 === 0) for (const k of [0, 2, 4, 7]) a._tone(o, t, spb * 8, { type: 'square', freq: this.note(chordRoot + k, 1), gain: 0.012, attack: 0.05 });
    if (l === 'arp' && s % 2 === 1) a._tone(o, t, spb * 1.5, { type: 'triangle', freq: this.note(chordRoot + [0, 2, 4, 6, 4, 2, 7, 4][s % 8], 2), gain: 0.04 });
    void fx;
  }
}

export const audio = new AudioSystem();
