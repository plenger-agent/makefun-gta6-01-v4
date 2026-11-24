// wanted.js — the Azahar Bay PD's attention model. One job: turn crimes into stars.
// Crimes add "heat"; crossing thresholds raises the star count (0–5). Police line of
// sight keeps heat fresh; staying unseen lets heat bleed away and stars drop. The bust
// meter itself is driven by police.js, but the rules for gaining/losing attention all
// live here so tuning the whole system means editing one file.

import { S, clamp } from './config.js';
import { sfx } from './audio.js';

export const CRIME_HEAT = {
  carTheft: 0.55,
  carTheftWitnessed: 0.9,
  hitCar: 0.3,
  hitCarHard: 0.55,
  hitPed: 1.15,
  killPed: 1.6,
  punchPed: 0.7,
  shotFired: 0.5,
  shotHitCop: 1.4,
  copCarRam: 0.8,
  copDown: 2.2,
  propertyDamage: 0.22,
  resistArrest: 0.4,
  missionCrime: 0.65,
};

const STAR_THRESHOLDS = [0, 0.6, 1.7, 3.1, 4.8, 6.8]; // heat needed for 0..5 stars
let decayDelay = 0;      // grace seconds after the last sighting before heat decays
let onStarChange = null;

export function initWanted(starChangeFn) { onStarChange = starChangeFn; }

export function starsForHeat(heat) {
  let s = 0;
  for (let i = 1; i < STAR_THRESHOLDS.length; i++) if (heat >= STAR_THRESHOLDS[i]) s = i;
  return s;
}

export function reportCrime(kind, witnessed = true) {
  const add = CRIME_HEAT[kind] || 0.3;
  if (!witnessed && S.wanted === 0 && kind !== 'killPed') {
    // unwitnessed minor crimes only sometimes register (a distant camera, a shout)
    if (Math.random() > 0.35) return;
  }
  const before = S.wanted;
  S.heat = clamp(S.heat + add, 0, 8.4);
  S.wanted = Math.max(S.wanted, starsForHeat(S.heat));
  decayDelay = Math.max(decayDelay, 2.5);
  if (S.wanted > before) {
    sfx.star();
    if (onStarChange) onStarChange(S.wanted);
  }
}

export function policeSeePlayer() {
  S.hiddenTime = 0;
  decayDelay = Math.max(decayDelay, 1.6);
  // being watched slowly feeds heat at high levels (they radio your description in)
  if (S.wanted >= 3) S.heat = clamp(S.heat + 0.008, 0, 8.4);
}

export function updateWanted(dt) {
  S.hiddenTime += dt;
  if (decayDelay > 0) { decayDelay -= dt; return; }
  if (S.wanted === 0) { S.heat = Math.max(0, S.heat - dt * 0.25); return; }
  // decay only while unseen; slower at higher stars
  if (S.hiddenTime > 2.2) {
    const rate = 0.14 + (5 - S.wanted) * 0.028;
    S.heat = Math.max(0, S.heat - dt * rate * (S.hiddenTime > 6 ? 1.7 : 1));
    const ns = starsForHeat(S.heat);
    if (ns < S.wanted) {
      S.wanted = ns;
      if (onStarChange) onStarChange(S.wanted);
    }
  }
}

export function clearWanted() {
  S.wanted = 0; S.heat = 0; S.hiddenTime = 0; S.bust = 0;
  if (onStarChange) onStarChange(0);
}

export function setWanted(n) {
  S.wanted = clamp(n, 0, 5);
  S.heat = STAR_THRESHOLDS[S.wanted] + 0.05;
  if (onStarChange) onStarChange(S.wanted);
}

export function isHiding() { return S.wanted > 0 && S.hiddenTime > 2.2; }

// 0..1 progress toward the next star, for HUD flavour and mission sub-text.
export function heatFraction() {
  const cur = STAR_THRESHOLDS[S.wanted] || 0;
  const next = STAR_THRESHOLDS[S.wanted + 1];
  if (next === undefined) return 1;
  return clamp((S.heat - cur) / (next - cur), 0, 1);
}
