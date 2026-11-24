// combat.js — fists and the Marlin pistol. One job: resolve the player's attacks
// (melee arc, hitscan shots with tracer + muzzle flash), apply damage to pedestrians,
// cars and police, let hurt peds and cops feed the wanted system, and apply incoming
// damage to the player (being rammed, busted shoves) through a single hurtPlayer door.

import * as THREE from 'three';
import { S, clamp, dist2d } from './config.js';
import { player, startPunchAnim } from './player.js';
import { peds, hurtPed, scarePeds, nearestPedTo } from './pedestrians.js';
import { cars } from './vehicles.js';
import { copCars } from './police.js';
import { reportCrime } from './wanted.js';
import { burst, addTracer, addShake } from './effects.js';
import { sfx } from './audio.js';

let scene = null, onPlayerDead = null, muzzle = null, muzzleT = 0;
let fireCd = 0, meleeCd = 0;

export function initCombat(sc, deadFn) {
  scene = sc; onPlayerDead = deadFn;
  muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0 }));
  scene.add(muzzle);
}

export function hurtPlayer(dmg, cause) {
  if (S.mode !== 'play') return;
  let left = dmg;
  if (S.armor > 0) {
    const absorbed = Math.min(S.armor, left * 0.65);
    S.armor -= absorbed; left -= absorbed;
  }
  S.health = clamp(S.health - left, 0, 100);
  const v = document.getElementById('damage-vignette');
  if (v) { v.style.opacity = '0.85'; setTimeout(() => { v.style.opacity = '0'; }, 130); }
  addShake(clamp(dmg * 0.02, 0.1, 0.45));
  if (S.health <= 0 && onPlayerDead) onPlayerDead(cause);
}

export function healPlayer(n) { S.health = clamp(S.health + n, 0, 100); }

function meleeAttack() {
  if (meleeCd > 0) return;
  meleeCd = 0.34;
  startPunchAnim();
  sfx.swing();
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  const px = player.pos.x + fx * 1.1, pz = player.pos.z + fz * 1.1;
  const ped = nearestPedTo({ x: px, z: pz }, 1.5);
  if (ped) {
    hurtPed(ped, 34, 'punch', player.pos);
    sfx.punch();
    reportCrime('punchPed', true);
    scarePeds(ped.mesh.position, 9, 'fight');
    return;
  }
  // punch a car: dents it, angers the neighbourhood a little
  for (const car of cars) {
    if (car.dead) continue;
    if (dist2d(car.mesh.position.x, car.mesh.position.z, px, pz) < car.len * 0.55) {
      car.health -= 4; burst.sparks(car.mesh.position, 4); sfx.punch();
      if (car.driver === 'police') reportCrime('copCarRam', true);
      return;
    }
  }
}

function pistolShot(aimHeading) {
  if (fireCd > 0) return;
  if (S.pistolAmmo <= 0) { sfx.dryFire(); fireCd = 0.3; return; }
  fireCd = 0.21;
  S.pistolAmmo--;
  sfx.shot();
  reportCrime('shotFired', true);
  const origin = new THREE.Vector3(player.pos.x, 1.45, player.pos.z);
  const dir = new THREE.Vector3(Math.sin(aimHeading), 0, Math.cos(aimHeading));
  const range = 46;
  let bestT = range, hitKind = null, hitObj = null;
  const testPoint = (x, y, z, r, kind, obj) => {
    const ox = x - origin.x, oz = z - origin.z;
    const t = ox * dir.x + oz * dir.z;
    if (t < 0.5 || t > bestT) return;
    const cx = origin.x + dir.x * t, cz = origin.z + dir.z * t;
    if (Math.hypot(x - cx, z - cz) < r && y > 0 && y < 2.4) { bestT = t; hitKind = kind; hitObj = obj; }
  };
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    testPoint(ped.mesh.position.x, 1.2, ped.mesh.position.z, 0.55, 'ped', ped);
  }
  for (const car of cars) {
    if (car.dead) continue;
    testPoint(car.mesh.position.x, 0.9, car.mesh.position.z, car.len * 0.5, 'car', car);
  }
  // range falloff: beyond 25 units the Marlin loses half its bite
  const falloff = bestT > 25 ? 0.5 : 1;
  const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
  addTracer(origin.clone().add(new THREE.Vector3(0, 0.05, 0)), end);
  muzzle.position.copy(origin).add(dir.clone().multiplyScalar(0.6));
  muzzle.material.opacity = 0.95; muzzleT = 0.05;
  addShake(0.12);
  scarePeds(player.pos, 16, 'gunshot');
  if (hitKind === 'ped') {
    hurtPed(hitObj, Math.round(62 * falloff), 'shot', player.pos);
    reportCrime(hitObj.health <= 0 ? 'killPed' : 'hitPed', true);
    if (copCars.length > 0) reportCrime('shotHitCop', false); // firing near officers escalates
  } else if (hitKind === 'car') {
    hitObj.health -= Math.round(16 * falloff);
    burst.sparks(end, 7);
    if (hitObj.driver === 'police') { reportCrime('shotHitCop', true); hitObj.health -= 10; }
  }
}

export function updateCombat(dt, attackHeld, aimHeading) {
  fireCd -= dt; meleeCd -= dt;
  if (muzzleT > 0) { muzzleT -= dt; if (muzzleT <= 0 && muzzle) muzzle.material.opacity = 0; }
  if (S.inCar || S.mode !== 'play') return;
  if (!attackHeld) return;
  if (S.weapon === 'pistol' && S.hasPistol) pistolShot(aimHeading);
  else meleeAttack();
}

export function reloadPistol() {
  if (!S.hasPistol || S.pistolAmmo >= 12 || S.pistolReserve <= 0) return false;
  const need = 12 - S.pistolAmmo;
  const take = Math.min(need, S.pistolReserve);
  S.pistolAmmo += take; S.pistolReserve -= take;
  sfx.reload();
  return true;
}
