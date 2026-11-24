// pedestrians.js — the walking population of Azahar Bay. One job: spawn a capped pool
// of simply-animated citizens who stroll the sidewalks and the beach, chat in pairs,
// and — crucially — notice danger: they flee screaming from speeding cars, gunfire and
// fights, cower when a police chase passes, and can be mugged/hit (which the wanted
// system hears about). Pedestrian meshes are shared-geometry low-poly figures.

import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF, SIDEWALK, BAY_Z, PED_SHIRTS, PED_FIRST, PED_LAST, rng, rand, pick, clamp, dist2d } from './config.js';
import { collideCircle } from './world.js';
import { burst } from './effects.js';

export const peds = [];
const MAX_PEDS = 26;
let scene = null, getPlayerPos = null, onPedEvent = null;

const skinMats = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const legMats = [0x2c3e50, 0x5d4a35, 0x707880, 0x27354a, 0x6e2f2f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const shirtMats = PED_SHIRTS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function limb(mat, w, h, d, x, y, z, parent) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
  parent.add(m); return m;
}

// A ped figure with pivot groups at hips/shoulders so limbs can swing.
export function makePedMesh(shirtIdx) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const shirt = shirtMats[shirtIdx % shirtMats.length];
  const skin = pick(skinMats), legs = pick(legMats);
  limb(shirt, 0.52, 0.62, 0.3, 0, 1.12, 0, inner);                       // torso
  const head = limb(skin, 0.3, 0.34, 0.3, 0, 1.62, 0, inner);           // head
  limb(new THREE.MeshLambertMaterial({ color: pick([0x201812, 0x4a2f18, 0x777777, 0xb5502e]) }), 0.32, 0.1, 0.32, 0, 1.82, 0, inner); // hair
  const mkArm = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(0.33 * side, 1.38, 0); inner.add(pivot);
    limb(shirt, 0.15, 0.34, 0.15, 0, -0.15, 0, pivot);
    limb(skin, 0.13, 0.3, 0.13, 0, -0.46, 0, pivot);
    return pivot;
  };
  const mkLeg = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(0.14 * side, 0.82, 0); inner.add(pivot);
    limb(legs, 0.18, 0.8, 0.18, 0, -0.4, 0, pivot);
    return pivot;
  };
  const parts = { armL: mkArm(-1), armR: mkArm(1), legL: mkLeg(-1), legR: mkLeg(1), head };
  g.userData.parts = parts;
  return g;
}

function sidewalkPoint() {
  const vertical = rng() < 0.5;
  const line = pick(ROAD_LINES);
  const side = rng() < 0.5 ? -1 : 1;
  const off = ROAD_HALF + SIDEWALK * 0.55;
  const along = rand(-238, 238);
  if (vertical) return { x: line + side * off, z: along, axis: 'z', line, side };
  return { x: along, z: line + side * off, axis: 'x', line, side };
}

export function spawnPed(anywhere = false) {
  const p0 = getPlayerPos ? getPlayerPos() : { x: 0, z: 0 };
  let pt;
  if (!anywhere && rng() < 0.22) { // beach strollers
    pt = { x: rand(-230, 230), z: BAY_Z + rand(4, 22), axis: 'x', line: 0, side: 1, beach: true };
  } else {
    pt = sidewalkPoint();
    if (!anywhere && Math.hypot(pt.x - p0.x, pt.z - p0.z) > 170) {
      pt.x = clamp(p0.x + rand(-70, 70), -245, 245);
      pt.z = clamp(p0.z + rand(-70, 70), -245, 268);
    }
  }
  const mesh = makePedMesh(randi0());
  mesh.position.set(pt.x, 0, pt.z);
  scene.add(mesh);
  const ped = {
    name: `${pick(PED_FIRST)} ${pick(PED_LAST)}`,
    mesh, parts: mesh.userData.parts,
    axis: pt.axis, line: pt.line, side: pt.side, beach: !!pt.beach,
    dir: rng() < 0.5 ? 1 : -1,
    speed: rand(1.1, 1.9), walkPhase: rand(0, 6),
    state: 'walk',               // walk | flee | cower | down | chat
    stateT: 0, health: 100, panic: 0,
    heading: 0, chatT: rand(4, 20),
  };
  mesh.rotation.y = ped.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  peds.push(ped);
  return ped;
}
function randi0() { return Math.floor(rng() * PED_SHIRTS.length); }

export function initPeds(sc, playerPosFn, eventFn) {
  scene = sc; getPlayerPos = playerPosFn; onPedEvent = eventFn;
  for (let i = 0; i < MAX_PEDS; i++) spawnPed(true);
}

export function scarePeds(pos, radius, cause) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = dist2d(ped.mesh.position.x, ped.mesh.position.z, pos.x, pos.z);
    if (d < radius) {
      ped.state = 'flee'; ped.stateT = rand(1.6, 3.4); ped.panic = 1;
      ped.fleeFrom = { x: pos.x, z: pos.z };
      if (onPedEvent) onPedEvent('scare', ped, cause);
    }
  }
}

export function hurtPed(ped, dmg, cause, fromPos) {
  if (ped.state === 'down') return;
  ped.health -= dmg;
  burst.blood(ped.mesh.position, dmg > 30 ? 12 : 6);
  if (ped.health <= 0) {
    ped.state = 'down'; ped.stateT = 999;
    ped.mesh.rotation.x = Math.PI / 2 * 0.92;
    ped.mesh.position.y = 0.25;
    if (onPedEvent) onPedEvent('down', ped, cause);
  } else {
    ped.state = 'flee'; ped.stateT = rand(2, 3.6); ped.fleeFrom = fromPos || ped.mesh.position;
    if (onPedEvent) onPedEvent('hurt', ped, cause);
  }
}

export function updatePeds(dt, threats) {
  const pp = getPlayerPos();
  // recycle far-away peds toward the player
  for (let i = peds.length - 1; i >= 0; i--) {
    const ped = peds[i];
    const d = dist2d(ped.mesh.position.x, ped.mesh.position.z, pp.x, pp.z);
    if (d > 240 && ped.state !== 'down') {
      scene.remove(ped.mesh); peds.splice(i, 1);
    }
  }
  while (peds.length < MAX_PEDS) spawnPed(false);

  for (const ped of peds) {
    const pos = ped.mesh.position;
    if (ped.state === 'down') continue;
    ped.stateT -= dt;
    // threat scan: fast cars and the player's drawn weapon
    let threat = null;
    for (const t of threats) {
      const d = dist2d(pos.x, pos.z, t.x, t.z);
      if (d < t.radius) { threat = t; break; }
    }
    if (threat && ped.state !== 'flee') {
      ped.state = 'flee'; ped.stateT = rand(1.8, 3.2); ped.fleeFrom = { x: threat.x, z: threat.z };
    }
    let moveSpeed = 0, targetHeading = ped.heading;
    if (ped.state === 'flee') {
      const fx = pos.x - (ped.fleeFrom ? ped.fleeFrom.x : pp.x);
      const fz = pos.z - (ped.fleeFrom ? ped.fleeFrom.z : pp.z);
      targetHeading = Math.atan2(fx, fz);
      moveSpeed = 4.6;
      if (ped.stateT <= 0) { ped.state = 'walk'; ped.panic = 0; }
    } else if (ped.state === 'cower') {
      moveSpeed = 0;
      if (ped.stateT <= 0) ped.state = 'walk';
    } else {
      // stroll along the current sidewalk axis; turn around at block ends / randomly
      if (ped.beach) {
        targetHeading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (pos.x > 244) ped.dir = -1; if (pos.x < -244) ped.dir = 1;
      } else if (ped.axis === 'z') {
        targetHeading = ped.dir > 0 ? 0 : Math.PI;
        if (pos.z > 244) ped.dir = -1; if (pos.z < -244) ped.dir = 1;
      } else {
        targetHeading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (pos.x > 244) ped.dir = -1; if (pos.x < -244) ped.dir = 1;
      }
      if (rng() < dt * 0.02) ped.dir *= -1;
      moveSpeed = ped.speed;
      // idle chat: occasionally stop and wave arms
      ped.chatT -= dt;
      if (ped.chatT <= 0) { ped.state = 'cower'; ped.stateT = rand(1, 2.2); ped.chatT = rand(6, 22); ped.chatting = true; }
      else ped.chatting = false;
    }
    // steer + move
    let dh = targetHeading - ped.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    ped.heading += dh * Math.min(1, dt * 6);
    if (moveSpeed > 0) {
      pos.x += Math.sin(ped.heading) * moveSpeed * dt;
      pos.z += Math.cos(ped.heading) * moveSpeed * dt;
      const cp = { x: pos.x, z: pos.z };
      collideCircle(cp, 0.45);
      pos.x = cp.x; pos.z = cp.z;
    }
    ped.mesh.rotation.y = ped.heading;
    // walk-cycle animation
    ped.walkPhase += dt * (moveSpeed > 3 ? 11 : moveSpeed > 0 ? 7.5 : 1.2);
    const sw = moveSpeed > 0 ? Math.sin(ped.walkPhase) * 0.55 : 0;
    ped.parts.legL.rotation.x = sw; ped.parts.legR.rotation.x = -sw;
    if (ped.state === 'flee') {
      ped.parts.armL.rotation.x = Math.PI * 0.85 + Math.sin(ped.walkPhase * 1.4) * 0.2;
      ped.parts.armR.rotation.x = Math.PI * 0.85 - Math.sin(ped.walkPhase * 1.4) * 0.2;
    } else if (ped.chatting) {
      ped.parts.armL.rotation.x = Math.sin(ped.walkPhase * 2.2) * 0.5 - 0.4;
      ped.parts.armR.rotation.x = -Math.sin(ped.walkPhase * 2.2) * 0.5 - 0.4;
    } else {
      ped.parts.armL.rotation.x = -sw * 0.8; ped.parts.armR.rotation.x = sw * 0.8;
    }
    pos.y = moveSpeed > 0 ? Math.abs(Math.sin(ped.walkPhase)) * 0.05 : 0;
  }
}

export function nearestPedTo(pos, maxDist) {
  let best = null, bd = maxDist;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = dist2d(ped.mesh.position.x, ped.mesh.position.z, pos.x, pos.z);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}
