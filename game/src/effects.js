// effects.js — juice for Azahar Heat: pooled particles (sparks, dust, smoke, splash,
// confetti), skid-mark ribbons, floating cash text, hit tracers and screen shake.
// One job: own every transient visual that is not a persistent world object, with hard
// pool caps so the frame rate never depends on how chaotic the scene gets.

import * as THREE from 'three';
import { clamp } from './config.js';

const MAX_PARTICLES = 420;
const MAX_SKIDS = 260;

let scene = null;
let points = null, pGeo = null, pPos = null, pCol = null, pVel = null, pLife = null, pMaxLife = null, pGrav = null;
let pHead = 0;
let skids = null, skidHead = 0;
let shakeAmp = 0;
const tracers = [];
const floaters = [];

const skidMat = new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.55, depthWrite: false });
const skidGeo = new THREE.PlaneGeometry(0.34, 1);

export function initEffects(sc) {
  scene = sc;
  pPos = new Float32Array(MAX_PARTICLES * 3);
  pCol = new Float32Array(MAX_PARTICLES * 3);
  pVel = new Float32Array(MAX_PARTICLES * 3);
  pLife = new Float32Array(MAX_PARTICLES);
  pMaxLife = new Float32Array(MAX_PARTICLES);
  pGrav = new Float32Array(MAX_PARTICLES);
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  skids = new THREE.Group();
  scene.add(skids);
  for (let i = 0; i < MAX_SKIDS; i++) {
    const m = new THREE.Mesh(skidGeo, skidMat);
    m.rotation.x = -Math.PI / 2; m.position.y = -50; m.renderOrder = 1;
    skids.add(m);
  }
}

function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav) {
  const i = pHead; pHead = (pHead + 1) % MAX_PARTICLES;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  pLife[i] = life; pMaxLife[i] = life; pGrav[i] = grav;
}
const jr = (a) => (Math.random() - 0.5) * a;

export const burst = {
  sparks(p, n = 10) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 0.4, p.z, jr(7), Math.random() * 4, jr(7), 0.35 + Math.random() * 0.3, 1, 0.75, 0.25, -6); },
  dust(p, n = 8) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 0.25, p.z, jr(3), 0.6 + Math.random(), jr(3), 0.6 + Math.random() * 0.5, 0.76, 0.66, 0.5, 0.4); },
  smoke(p, n = 6) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 0.8, p.z, jr(1.2), 1.6 + Math.random(), jr(1.2), 0.9 + Math.random() * 0.6, 0.25, 0.25, 0.27, 0.8); },
  splash(p, n = 14) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 0.2, p.z, jr(5), 2.5 + Math.random() * 3, jr(5), 0.5 + Math.random() * 0.4, 0.45, 0.75, 0.95, -9); },
  confetti(p, n = 22) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 1.6, p.z, jr(6), 2 + Math.random() * 3.5, jr(6), 0.9 + Math.random() * 0.7, Math.random(), Math.random() * 0.8 + 0.2, Math.random(), -3.5); },
  blood(p, n = 7) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 1, p.z, jr(3.4), 1 + Math.random() * 2, jr(3.4), 0.4 + Math.random() * 0.3, 0.72, 0.1, 0.12, -7); },
  cash(p, n = 10) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 1.2, p.z, jr(3), 2 + Math.random() * 2.5, jr(3), 0.8 + Math.random() * 0.5, 0.35, 0.9, 0.4, -2.5); },
  glass(p, n = 9) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 0.9, p.z, jr(5), 1.5 + Math.random() * 2.5, jr(5), 0.45 + Math.random() * 0.3, 0.65, 0.85, 0.95, -8); },
  leaves(p, n = 8) { for (let i = 0; i < n; i++) spawn(p.x, p.y + 2.6, p.z, jr(3.4), -0.4 - Math.random(), jr(3.4), 0.9 + Math.random() * 0.6, 0.2, 0.62, 0.25, -1.1); },
};

export function addSkid(x, z, heading, len) {
  const m = skids.children[skidHead]; skidHead = (skidHead + 1) % MAX_SKIDS;
  m.position.set(x, 0.03, z);
  m.rotation.z = -heading;
  m.scale.set(1, Math.max(len, 0.4), 1);
}
export function addShake(amp) { shakeAmp = Math.min(shakeAmp + amp, 0.9); }
export function shakeOffset() {
  if (shakeAmp < 0.01) return { x: 0, y: 0 };
  const a = shakeAmp;
  return { x: jr(a) * 0.35, y: jr(a) * 0.3 };
}

const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
export function addTracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(g, tracerMat);
  scene.add(line);
  tracers.push({ line, life: 0.07 });
}

export function floater(worldPos, text, color = '#7dff9a') {
  floaters.push({ pos: worldPos.clone(), text, color, life: 1.4 });
}
export function getFloaters() { return floaters; }

export function updateEffects(dt) {
  shakeAmp = Math.max(0, shakeAmp - dt * 1.6);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -60; continue; }
    pLife[i] -= dt;
    pVel[i * 3 + 1] += pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; pVel[i * 3 + 1] = 0; }
  }
  pGeo.attributes.position.needsUpdate = true;
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers[i].line.geometry.dispose(); tracers.splice(i, 1); }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].life -= dt;
    floaters[i].pos.y += dt * 1.6;
    if (floaters[i].life <= 0) floaters.splice(i, 1);
  }
}
export function fadeAmount(v) { return clamp(v, 0, 1); }
