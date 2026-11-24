// police.js — the Azahar Bay Police Department. One job: spawn Interceptors in
// proportion to the wanted level, drive them at the player with pursuit steering
// (intercept course, PIT nudges, boxing), run the bust meter when the player is
// cornered on foot or stopped in a car, and back off when the player gives them
// the slip. Foot officers are folded into the bust rule to keep the frame budget.

import { S, clamp, rand, dist2d } from './config.js';
import { spawnCar, removeCar, driveCar, cars } from './vehicles.js';
import { reportCrime, policeSeePlayer } from './wanted.js';
import { burst, addShake } from './effects.js';
import { updateSiren } from './audio.js';

export const copCars = [];
let getTarget = null;      // () => {pos, car, speed}
let onBusted = null;
let spawnCd = 0;
const lightbarMats = [];

export function desiredCops() {
  return [0, 1, 2, 3, 4, 6][S.wanted] || 0;
}

export function initPolice(targetFn, bustedFn) {
  getTarget = targetFn; onBusted = bustedFn;
}

function spawnCop() {
  const t = getTarget();
  const ang = rand(0, Math.PI * 2);
  const dist = rand(52, 74);
  const x = clamp(t.pos.x + Math.sin(ang) * dist, -248, 248);
  const z = clamp(t.pos.z + Math.cos(ang) * dist, -248, 262);
  const car = spawnCar('police', x, z, ang + Math.PI, { driver: 'police' });
  car.ai = { role: copCars.length % 3 === 2 ? 'blocker' : 'chaser', ramCd: 0 };
  // register lightbar materials for the flash animation
  car.mesh.traverse((o) => { if (o.name === 'lightbar' || o.name === 'lightbar2') lightbarMats.push(o); });
  copCars.push(car);
  return car;
}

export function clearPolice() {
  for (const c of [...copCars]) removeCar(c);
  copCars.length = 0;
  updateSiren(0, false, 999);
}

let flashT = 0;
export function updatePolice(dt, elapsed) {
  const t = getTarget();
  spawnCd -= dt;
  const want = desiredCops();
  // spawn / despawn to match the wanted level
  if (copCars.length < want && spawnCd <= 0) { spawnCop(); spawnCd = 1.6; }
  for (let i = copCars.length - 1; i >= 0; i--) {
    const c = copCars[i];
    const d = dist2d(c.mesh.position.x, c.mesh.position.z, t.pos.x, t.pos.z);
    if (c.dead || c.driver !== 'police' || (S.wanted === 0 && d > 40) || d > 300) {
      removeCar(c); copCars.splice(i, 1);
    }
  }
  // lightbar flash
  flashT += dt * 9;
  const phase = Math.sin(flashT) > 0;
  for (const m of lightbarMats) {
    if (!m.parent) continue;
    m.material.color.setHex(m.name === 'lightbar' ? (phase ? 0xff2233 : 0x551118) : (phase ? 0x113355 : 0x2266ff));
  }
  let nearest = 999, anySee = false, boxedPressure = 0;

  for (const cop of copCars) {
    const pos = cop.mesh.position;
    const d = dist2d(pos.x, pos.z, t.pos.x, t.pos.z);
    nearest = Math.min(nearest, d);
    const sees = d < 78;
    if (sees) { anySee = true; policeSeePlayer(); }
    const ai = cop.ai; ai.ramCd -= dt;
    // aim point: intercept the target's motion; blockers aim ahead of it
    const lead = ai.role === 'blocker' ? 2.2 : 1.1;
    const aimX = t.pos.x + (t.vel ? t.vel.x * lead * Math.min(d / 22, 1.4) : 0);
    const aimZ = t.pos.z + (t.vel ? t.vel.z * lead * Math.min(d / 22, 1.4) : 0);
    const wantHeading = Math.atan2(aimX - pos.x, aimZ - pos.z);
    let dh = wantHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 1.9, -1, 1);
    // blockers that get ahead of the target angle across the road and hold —
    // a soft roadblock the player must dodge around (or through, at a price).
    if (ai.role === 'blocker' && d < 15 && t.car) {
      const aheadOf = (pos.x - t.pos.x) * (t.vel ? t.vel.x : 0) + (pos.z - t.pos.z) * (t.vel ? t.vel.z : 0);
      if (aheadOf > 4 && Math.abs(cop.speed) < 3) {
        driveCar(cop, { throttle: 0, steer: 0.9, handbrake: true }, dt, null);
        if (d < 9) boxedPressure += 0.3;
        continue;
      }
    }
    // throttle: full chase far away, match speed close, reverse if overshot/stuck
    let throttle = 1;
    const targetSpeed = t.speed || 0;
    if (d < 7) throttle = cop.speed > targetSpeed + 2 ? -0.4 : 0.25;
    else if (d < 16) throttle = cop.speed > targetSpeed + 4 ? 0 : 0.65;
    if (Math.abs(dh) > 2.5 && d < 8) throttle = -0.9; // turned around: back up
    if (cop.speed < 0.4 && d > 10 && Math.abs(dh) < 0.4 && ai.ramCd <= 0) { throttle = 1; ai.ramCd = 2; }
    const crashedInto = driveCar(cop, { throttle, steer, handbrake: Math.abs(dh) > 1.1 && cop.speed > 12 }, dt, null);
    if (crashedInto > 8 && d < 9) reportCrime('copCarRam', true);
    // bust pressure: a cop close + player slow = boxed in
    const playerSlow = (t.speed || 0) < 2.2;
    if (d < 8.5 && playerSlow) boxedPressure += (8.5 - d) / 8.5;
    if (d < 3.4 && t.car && cop.speed > 6 && ai.ramCd <= 0) {
      // PIT nudge
      ai.ramCd = 3;
      burst.sparks(pos, 8); addShake(0.3);
    }
  }

  // ---- bust meter ----
  if (S.wanted > 0 && boxedPressure > 0.35) {
    S.bust = clamp(S.bust + dt * 0.34 * boxedPressure, 0, 1);
  } else {
    S.bust = clamp(S.bust - dt * 0.5, 0, 1);
  }
  if (S.bust >= 1 && onBusted) { onBusted(); }
  updateSiren(dt, copCars.length > 0 && S.wanted > 0, nearest);
  return { nearest, anySee };
}

export function copCount() { return copCars.length; }
