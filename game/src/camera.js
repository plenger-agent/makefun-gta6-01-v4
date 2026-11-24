// camera.js — the third-person camera. One job: follow the player smoothly on foot
// (mouse-orbit yaw/pitch, collision-free lift over rooftops is approximated by a
// minimum height) and chase cars from behind with speed-based FOV and look-ahead.
// Screen shake from effects.js is layered on top here so every system benefits.

import * as THREE from 'three';
import { S, clamp, lerp, angleLerp } from './config.js';
import { mouse } from './input.js';
import { shakeOffset } from './effects.js';

export const cam = {
  yaw: Math.PI, pitch: 0.32, dist: 9,
  pos: new THREE.Vector3(0, 6, -12),
  look: new THREE.Vector3(),
  fov: 62,
  driftTime: 0, // seconds spent sliding; feeds a subtle roll while drifting
};

export function initCamera(camera) {
  camera.fov = cam.fov;
  camera.near = 0.1; camera.far = 1600;
  camera.updateProjectionMatrix();
}

export function updateCamera(dt, camera, target) {
  // target: {pos, heading, speed, inCar}
  if (target.inCar) {
    // chase cam: yaw eases toward the car's heading; mouse can offset briefly
    const wantYaw = target.heading + Math.PI;
    cam.yaw = angleLerp(cam.yaw, wantYaw, Math.min(1, dt * (2.2 + Math.abs(target.speed) * 0.04)));
    cam.yaw -= mouse.dx * 0.0022;
    cam.pitch = clamp(cam.pitch + mouse.dy * 0.0016, 0.12, 0.6);
    const wantDist = 8.6 + Math.abs(target.speed) * 0.16;
    cam.dist = lerp(cam.dist, wantDist, Math.min(1, dt * 3));
    const targetFov = 62 + clamp(Math.abs(target.speed), 0, 48) * 0.42;
    cam.fov = lerp(cam.fov, targetFov, Math.min(1, dt * 2.4));
  } else {
    cam.yaw -= mouse.dx * 0.0032;
    cam.pitch = clamp(cam.pitch + mouse.dy * 0.0022, 0.06, 1.15);
    cam.dist = lerp(cam.dist, 8.2, Math.min(1, dt * 4));
    cam.fov = lerp(cam.fov, 60, Math.min(1, dt * 3));
  }
  if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  const cx = target.pos.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cz = target.pos.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cy = target.pos.y + Math.sin(cam.pitch) * cam.dist + 1.6;
  const k = Math.min(1, dt * (target.inCar ? 7 : 10));
  cam.pos.x = lerp(cam.pos.x, cx, k);
  cam.pos.z = lerp(cam.pos.z, cz, k);
  cam.pos.y = lerp(cam.pos.y, Math.max(cy, 1.1), k);
  const sh = shakeOffset();
  camera.position.set(cam.pos.x + sh.x, cam.pos.y + sh.y, cam.pos.z);
  // a whisper of roll at speed sells the chase without making anyone seasick
  camera.rotation.z += target.inCar ? clamp(target.speed * 0.0011, -0.02, 0.035) : 0;
  // look slightly ahead of motion
  const ahead = target.inCar ? clamp(target.speed * 0.32, -4, 9) : 1.6;
  cam.look.set(
    target.pos.x - Math.sin(cam.yaw) * ahead * 0.4 + (target.vel ? target.vel.x * 0.14 : 0),
    target.pos.y + 1.7,
    target.pos.z - Math.cos(cam.yaw) * ahead * 0.4 + (target.vel ? target.vel.z * 0.14 : 0),
  );
  camera.lookAt(cam.look);
  return cam.yaw;
}

export function snapCameraBehind(camera, target) {
  cam.yaw = target.heading + Math.PI;
  cam.pos.set(
    target.pos.x + Math.sin(cam.yaw) * cam.dist,
    target.pos.y + 4,
    target.pos.z + Math.cos(cam.yaw) * cam.dist,
  );
  camera.position.copy(cam.pos);
}
