// player.js — the player character: Rafa Cordero, washed-up wheelman. One job: own the
// on-foot avatar (build, walk/run/sprint animation, hop, swim-wade at the shoreline),
// its movement + collision, and the enter/exit-car handshake with vehicles.js.

import * as THREE from 'three';
import { S, clamp, rand } from './config.js';
import { collideCircle } from './world.js';
import { moveAxis, sprintHeld, brakeHeld } from './input.js';
import { makePedMesh } from './pedestrians.js';
import { burst } from './effects.js';
import { sfx } from './audio.js';

export const player = {
  mesh: null, parts: null,
  pos: null,               // alias of mesh.position
  heading: -Math.PI / 2,
  speed: 0,
  walkPhase: 0,
  vy: 0, grounded: true,
  attackCd: 0, stepAcc: 0,
  inWater: false,
};

export function initPlayer(scene) {
  const mesh = makePedMesh(0);
  // Rafa's signature look: coral shirt is ped palette 0 — add cap + sunglasses + satchel
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x14213d }));
  cap.position.set(0, 1.86, 0.02); mesh.children[0].add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x14213d }));
  brim.position.set(0, 1.82, 0.26); mesh.children[0].add(brim);
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  shades.position.set(0, 1.66, 0.17); mesh.children[0].add(shades);
  mesh.position.set(14, 0, 14);
  mesh.scale.setScalar(1.06);
  scene.add(mesh);
  player.mesh = mesh;
  player.parts = mesh.userData.parts;
  player.pos = mesh.position;
  return player;
}

// On-foot update. camYaw orients movement to the camera. Returns actual speed.
export function updatePlayer(dt, camYaw) {
  if (S.inCar) { player.mesh.visible = false; return 0; }
  player.mesh.visible = true;
  const { fwd, side } = moveAxis();
  const sprint = sprintHeld();
  const moving = fwd !== 0 || side !== 0;
  const baseSpeed = player.inWater ? 2.2 : sprint ? 7.6 : fwd !== 0 || side !== 0 ? 4.3 : 0;
  let targetSpeed = moving ? baseSpeed : 0;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 9);
  if (moving) {
    // Camera yaw points from the player toward the camera, so the view direction is
    // camYaw + PI; strafing right is a quarter-turn clockwise from the view direction.
    const moveAng = camYaw + Math.PI - Math.atan2(side, fwd);
    let dh = moveAng - player.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    player.heading += dh * Math.min(1, dt * 11);
    player.pos.x += Math.sin(player.heading) * player.speed * dt;
    player.pos.z += Math.cos(player.heading) * player.speed * dt;
    const cp = { x: player.pos.x, z: player.pos.z };
    collideCircle(cp, 0.5);
    player.pos.x = cp.x; player.pos.z = cp.z;
  }
  // shoreline: past z=272 the water slows you and splashes
  player.inWater = player.pos.z > 274;
  if (player.inWater && moving && Math.random() < dt * 6) { burst.splash(player.pos, 2); }
  // little hop
  if (brakeHeld() && player.grounded) { player.vy = 4.6; player.grounded = false; sfx.swing(); }
  if (!player.grounded) {
    player.vy -= 13 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.grounded = true; burst.dust(player.pos, 3); }
  }
  // animation
  player.walkPhase += dt * (player.speed > 5 ? 11.5 : 8) * (player.speed > 0.2 ? 1 : 0);
  const sw = player.speed > 0.2 ? Math.sin(player.walkPhase) * clamp(player.speed / 6, 0.25, 0.95) : 0;
  const p = player.parts;
  if (player.attackCd > 0) {
    player.attackCd -= dt;
    const t = 1 - player.attackCd / 0.32;
    p.armR.rotation.x = -Math.sin(Math.min(t, 1) * Math.PI) * 1.9;
    p.armL.rotation.x = sw * 0.4;
  } else if (S.weapon === 'pistol') {
    p.armR.rotation.x = -1.35; p.armL.rotation.x = -1.1; // two-hand aim stance
    p.legL.rotation.x = sw * 0.7; p.legR.rotation.x = -sw * 0.7;
  } else {
    p.armL.rotation.x = -sw * 0.85; p.armR.rotation.x = sw * 0.85;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
  }
  if (S.weapon !== 'pistol' && player.attackCd <= 0) { p.legL.rotation.x = sw; p.legR.rotation.x = -sw; }
  player.mesh.rotation.y = player.heading;
  if (player.grounded) player.pos.y = player.speed > 0.2 ? Math.abs(Math.sin(player.walkPhase)) * 0.055 : 0;
  // footstep dust on sand / sprint
  if (player.speed > 5 && player.grounded) {
    player.stepAcc += dt;
    if (player.stepAcc > 0.16) { player.stepAcc = 0; burst.dust(player.pos, 1); }
  }
  return player.speed;
}

export function placePlayerAtCarDoor(car) {
  const side = 1;
  const dx = Math.cos(car.heading) * side * 1.7;
  const dz = -Math.sin(car.heading) * side * 1.7;
  player.pos.set(car.mesh.position.x + dx, 0, car.mesh.position.z + dz);
  player.heading = car.heading + Math.PI / 2;
  const cp = { x: player.pos.x, z: player.pos.z };
  collideCircle(cp, 0.5);
  player.pos.x = cp.x; player.pos.z = cp.z;
}

export function startPunchAnim() { player.attackCd = 0.32; }
export function playerFeetPos() { return player.pos; }
export function randomSpawnJitter() { return rand(-1, 1); }
