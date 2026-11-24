// audio.js — all sound in Azahar Heat is synthesized with WebAudio: no audio files.
// One job: own the AudioContext and expose tiny one-shot effects (punch, shot, cash,
// crash, door, pickup, siren blip) plus two continuous loops — the car engine, whose
// pitch follows speed, and a soft coastal ambience (filtered noise "surf" + pad).

import { S } from './config.js';

let ctx = null, master = null;
let engineOsc = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenGain = null, sirenTimer = 0;
let ambGain = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = S.muted ? 0 : 0.55;
    master.connect(ctx.destination);
    startAmbience();
  } catch { ctx = null; }
}

export function setMuted(m) {
  S.muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
}

function env(gain, t0, peak, dur) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}
function tone(freq, dur, type = 'sine', peak = 0.2, slideTo = null, delay = 0) {
  if (!ctx || S.muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
  env(g, t0, peak, dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, peak = 0.2, freq = 1200, q = 0.8, delay = 0, type = 'bandpass') {
  if (!ctx || S.muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, (dur * ctx.sampleRate) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t0, peak, dur);
  src.connect(f).connect(g).connect(master); src.start(t0); src.stop(t0 + dur + 0.05);
}

function startAmbience() {
  // Surf: looped filtered noise with a slow swell LFO. Pad: two detuned triangles.
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  ambGain = ctx.createGain(); ambGain.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.025;
  lfo.connect(lfoG).connect(ambGain.gain);
  src.connect(f).connect(ambGain).connect(master);
  src.start(); lfo.start();
  tone(196, 9999, 'triangle', 0.012); tone(294, 9999, 'triangle', 0.008);
}

// ---- one-shots ----
export const sfx = {
  punch() { noise(0.09, 0.25, 500, 1); tone(120, 0.08, 'sine', 0.2, 60); },
  swing() { noise(0.07, 0.08, 1800, 2); },
  shot() { noise(0.16, 0.5, 2600, 0.4); tone(160, 0.12, 'square', 0.25, 40); },
  dryFire() { tone(1400, 0.04, 'square', 0.08); },
  reload() { tone(700, 0.05, 'square', 0.1); tone(500, 0.05, 'square', 0.1, null, 0.16); tone(900, 0.05, 'square', 0.12, null, 0.3); },
  cash() { tone(1320, 0.09, 'sine', 0.16); tone(1760, 0.14, 'sine', 0.16, null, 0.07); },
  pickup() { tone(880, 0.08, 'sine', 0.14); tone(1174, 0.1, 'sine', 0.14, null, 0.06); tone(1568, 0.16, 'sine', 0.12, null, 0.12); },
  door() { tone(220, 0.07, 'square', 0.1, 140); noise(0.06, 0.1, 800, 1); },
  crash(big = false) { noise(big ? 0.4 : 0.2, big ? 0.5 : 0.3, 300, 0.5, 0, 'lowpass'); tone(70, 0.25, 'sine', 0.3, 35); },
  horn() { tone(370, 0.28, 'square', 0.1); tone(466, 0.28, 'square', 0.08); },
  checkpoint() { tone(1046, 0.1, 'sine', 0.15); tone(1318, 0.16, 'sine', 0.15, null, 0.08); },
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, null, i * 0.11)); },
  busted() { [392, 370, 349, 311].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, null, i * 0.16)); },
  star() { tone(1568, 0.12, 'square', 0.07); tone(2093, 0.18, 'square', 0.06, null, 0.06); },
  phone() { tone(1046, 0.09, 'sine', 0.1); tone(1046, 0.09, 'sine', 0.1, null, 0.14); },
  splash() { noise(0.35, 0.2, 900, 0.6); },
  uiClick() { tone(980, 0.05, 'sine', 0.1); },
  scream() { tone(randPitch(), 0.28, 'sawtooth', 0.05, 500); },
  step() { noise(0.045, 0.05, 700, 1); },
};
function randPitch() { return 620 + Math.random() * 320; }

// ---- engine loop ----
export function setEngine(on, speedRatio, rpmLoad) {
  if (!ctx) return;
  if (on && !engineOsc) {
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
  }
  if (!engineOsc) return;
  const t = ctx.currentTime;
  if (!on) { engineGain.gain.setTargetAtTime(0, t, 0.15); return; }
  const rpm = 55 + speedRatio * 165 + (rpmLoad || 0) * 40;
  engineOsc.frequency.setTargetAtTime(rpm, t, 0.06);
  engineFilter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.08);
  engineGain.gain.setTargetAtTime(S.muted ? 0 : 0.05 + speedRatio * 0.05, t, 0.1);
}

// ---- police siren loop (two-tone) ----
export function updateSiren(dt, active, nearestDist) {
  if (!ctx) return;
  if (active && !sirenOsc) {
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master); sirenOsc.start();
  }
  if (!sirenOsc) return;
  const t = ctx.currentTime;
  if (!active) { sirenGain.gain.setTargetAtTime(0, t, 0.2); return; }
  sirenTimer += dt;
  const hi = sirenTimer % 0.72 < 0.36;
  sirenOsc.frequency.setTargetAtTime(hi ? 960 : 720, t, 0.03);
  const vol = S.muted ? 0 : Math.max(0, 0.055 * (1 - nearestDist / 90));
  sirenGain.gain.setTargetAtTime(vol, t, 0.1);
}
