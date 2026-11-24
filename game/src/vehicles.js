// vehicles.js — car factory + car physics for Azahar Heat. One job: build every car
// mesh (nine distinct silhouettes), keep the registry of all cars in the world, and
// step the arcade driving model (accelerate, steer, drift, collide) for whichever car
// is being driven — by the player, by traffic, or by the police.

import * as THREE from 'three';
import { VEHICLE_TYPES, PARKED_TYPES, ROAD_LINES, ROAD_HALF, rng, rand, pick, clamp } from './config.js';
import { collideCircle } from './world.js';
import { burst, addSkid, addShake } from './effects.js';
import { sfx } from './audio.js';

export const cars = [];
let scene = null;
const bodyGeoCache = {};

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a38 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9bec6 });
const lightMatF = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
const lightMatR = new THREE.MeshBasicMaterial({ color: 0xd8232a });
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);

function part(parent, mat, w, h, d, x, y, z) {
  const key = `${w}|${h}|${d}`;
  let g = bodyGeoCache[key];
  if (!g) { g = new THREE.BoxGeometry(w, h, d); bodyGeoCache[key] = g; }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.castShadow = true;
  parent.add(m);
  return m;
}

export function makeCarMesh(type, colorHex) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const wheels = [];
  const addWheel = (x, z) => {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); w.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), hubMat);
    hub.rotation.z = Math.PI / 2; w.add(hub);
    g.add(w); wheels.push(w);
    return w;
  };
  let L = 4.3, W = 1.9;
  if (type === 'sedan' || type === 'taxi' || type === 'police') {
    part(g, paint, W, 0.62, L, 0, 0.62, 0);
    part(g, glassMat, W - 0.25, 0.55, L * 0.48, 0, 1.16, -0.15);
    part(g, paint, W - 0.1, 0.1, L * 0.5, 0, 1.46, -0.15);
    if (type === 'taxi') {
      part(g, new THREE.MeshBasicMaterial({ color: 0x181818 }), 0.9, 0.22, 0.4, 0, 1.62, -0.15);
      part(g, new THREE.MeshLambertMaterial({ color: 0x181818 }), W, 0.2, L, 0, 0.42, 0);
    }
    if (type === 'police') {
      part(g, new THREE.MeshLambertMaterial({ color: 0x181c26 }), W + 0.02, 0.3, L * 0.4, 0, 0.6, 0.1);
      const bar = part(g, new THREE.MeshBasicMaterial({ color: 0xd8232a }), 1.1, 0.16, 0.34, 0, 1.62, -0.15);
      bar.name = 'lightbar';
      const bar2 = part(g, new THREE.MeshBasicMaterial({ color: 0x2a6fd8 }), 0.5, 0.16, 0.34, 0.3, 1.62, -0.15);
      bar2.name = 'lightbar2';
    }
  } else if (type === 'compact' || type === 'boatcar') {
    L = 3.5; W = 1.7;
    part(g, paint, W, 0.58, L, 0, 0.58, 0);
    part(g, glassMat, W - 0.2, 0.5, L * 0.44, 0, 1.08, 0.1);
    if (type === 'boatcar') part(g, paint, W - 0.3, 0.32, 0.5, 0, 0.95, -L / 2 + 0.2);
  } else if (type === 'sports') {
    L = 4.5; W = 2.0;
    part(g, paint, W, 0.5, L, 0, 0.52, 0);
    part(g, paint, W * 0.7, 0.34, L * 0.4, 0, 0.86, 0.25);
    part(g, glassMat, W * 0.62, 0.3, L * 0.34, 0, 0.92, 0.28);
    part(g, paint, W * 0.9, 0.1, 0.5, 0, 0.86, -L / 2 + 0.3); // rear wing base
    part(g, paint, 0.12, 0.22, 0.4, -0.7, 0.72, -L / 2 + 0.3);
    part(g, paint, 0.12, 0.22, 0.4, 0.7, 0.72, -L / 2 + 0.3);
  } else if (type === 'muscle') {
    L = 4.7; W = 2.0;
    part(g, paint, W, 0.6, L, 0, 0.6, 0);
    part(g, glassMat, W - 0.3, 0.5, L * 0.36, 0, 1.12, 0.3);
    part(g, paint, W * 0.5, 0.16, 1.1, 0, 0.98, -1.1); // hood scoop
  } else if (type === 'van') {
    L = 4.9; W = 2.0;
    part(g, paint, W, 1.5, L, 0, 1.05, 0);
    part(g, glassMat, W - 0.15, 0.55, 0.15, 0, 1.28, L / 2 - 0.35);
    part(g, paint, W, 0.35, 0.7, 0, 0.5, L / 2 + 0.1);
  } else if (type === 'truck') {
    L = 5.1; W = 2.05;
    part(g, paint, W, 0.85, 1.9, 0, 0.95, L / 2 - 1.05);       // cab
    part(g, glassMat, W - 0.2, 0.5, 0.14, 0, 1.15, L / 2 - 0.18);
    part(g, new THREE.MeshLambertMaterial({ color: 0x4a423a }), W, 0.55, L - 2.1, 0, 0.78, -0.55); // bed
  }
  // lights
  part(g, lightMatF, 0.34, 0.14, 0.06, -W / 2 + 0.3, 0.66, L / 2 + 0.01);
  part(g, lightMatF, 0.34, 0.14, 0.06, W / 2 - 0.3, 0.66, L / 2 + 0.01);
  part(g, lightMatR, 0.34, 0.12, 0.06, -W / 2 + 0.3, 0.68, -L / 2 - 0.01);
  part(g, lightMatR, 0.34, 0.12, 0.06, W / 2 - 0.3, 0.68, -L / 2 - 0.01);
  const fl = addWheel(-W / 2, L / 2 - 0.85), fr = addWheel(W / 2, L / 2 - 0.85);
  addWheel(-W / 2, -L / 2 + 0.85); addWheel(W / 2, -L / 2 + 0.85);
  return { group: g, wheels, frontWheels: [fl, fr], len: L, wid: W };
}

export function spawnCar(type, x, z, heading, opts = {}) {
  const spec = VEHICLE_TYPES[type];
  const color = opts.color !== undefined ? opts.color : pick(spec.colors);
  const { group, wheels, frontWheels, len, wid } = makeCarMesh(type, color);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const car = {
    type, spec, mesh: group, wheels, frontWheels, len, wid,
    heading, speed: 0, steer: 0, health: 100,
    driver: opts.driver || null,        // 'player' | 'traffic' | 'police' | null (parked)
    ai: opts.ai || null,
    color, locked: !!opts.locked,
    skidAcc: 0, hornCd: rand(4, 14), dead: false, smokeAcc: 0,
  };
  group.userData.car = car;
  cars.push(car);
  return car;
}

export function initVehicles(sc) {
  scene = sc;
  // parked cars along road edges + a few in the plaza car park
  for (const l of ROAD_LINES) {
    for (let t = -240; t < 240; t += 23) {
      if (rng() > 0.42) continue;
      const alongZ = rng() < 0.5;
      const jitter = rand(-2, 2);
      if (ROAD_LINES.some((o) => Math.abs(o - t) < 12)) continue;
      if (alongZ) spawnCar(pick(PARKED_TYPES), l + (rng() < 0.5 ? -1 : 1) * (ROAD_HALF - 1.4), t + jitter, 0);
      else spawnCar(pick(PARKED_TYPES), t + jitter, l + (rng() < 0.5 ? -1 : 1) * (ROAD_HALF - 1.4), Math.PI / 2);
    }
  }
  // hero cars: a Víbora by the marina, a Toro at the plaza, a buggy at the beach
  spawnCar('sports', -184 + 5.4, 120, Math.PI / 2);
  spawnCar('muscle', 8, 40, Math.PI);
  spawnCar('boatcar', 60, 258, Math.PI);
  spawnCar('taxi', 12, -14, -Math.PI / 2);
}

export function removeCar(car) {
  scene.remove(car.mesh);
  const i = cars.indexOf(car);
  if (i >= 0) cars.splice(i, 1);
  car.dead = true;
}

// Arcade drive step shared by player / traffic / police. input: {throttle -1..1, steer -1..1, handbrake}
export function driveCar(car, input, dt, onCrash) {
  const spec = car.spec;
  const accel = input.throttle > 0 ? spec.accel : spec.accel * 0.62;
  car.speed += input.throttle * accel * dt;
  // drag + rolling resistance
  car.speed -= car.speed * 0.55 * dt;
  if (input.handbrake) car.speed -= car.speed * 1.7 * dt;
  const maxF = spec.topSpeed, maxR = -11;
  car.speed = clamp(car.speed, maxR, maxF);
  if (Math.abs(input.throttle) < 0.05 && Math.abs(car.speed) < 0.25) car.speed = 0;
  const steerTarget = input.steer * (input.handbrake ? 1.5 : 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 7);
  const speedFactor = clamp(Math.abs(car.speed) / 9, 0, 1.15);
  const turnRate = car.steer * spec.grip * 0.62 * speedFactor * (car.speed < 0 ? -1 : 1);
  car.heading += turnRate * dt * (input.handbrake ? 1.35 : 1);
  const vx = Math.sin(car.heading) * car.speed;
  const vz = Math.cos(car.heading) * car.speed;
  const before = { x: car.mesh.position.x, z: car.mesh.position.z };
  car.mesh.position.x += vx * dt;
  car.mesh.position.z += vz * dt;
  // building collision (circle approx using car width)
  const hitP = { x: car.mesh.position.x, z: car.mesh.position.z };
  collideCircle(hitP, 1.55);
  const moved = Math.hypot(hitP.x - car.mesh.position.x, hitP.z - car.mesh.position.z);
  car.mesh.position.x = hitP.x; car.mesh.position.z = hitP.z;
  let crashed = 0;
  if (moved > 0.05 && Math.abs(car.speed) > 4) {
    crashed = Math.abs(car.speed);
    car.health -= crashed * 1.1;
    car.speed *= -0.18;
    burst.sparks(car.mesh.position, 12); burst.dust(car.mesh.position, 5);
    addShake(0.35); sfx.crash(crashed > 14);
    if (onCrash) onCrash(crashed);
  }
  // car-vs-car soft collision
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = car.mesh.position.x - other.mesh.position.x;
    const dz = car.mesh.position.z - other.mesh.position.z;
    const rr = (car.len + other.len) * 0.32;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.001) {
      const d = Math.sqrt(d2), push = (rr - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      car.mesh.position.x += nx * push; car.mesh.position.z += nz * push;
      other.mesh.position.x -= nx * push * 0.6; other.mesh.position.z -= nz * push * 0.6;
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 5) {
        other.health -= rel * 1.4; car.health -= rel * 0.7;
        burst.sparks(car.mesh.position, 9); addShake(0.25); sfx.crash(rel > 13);
        car.speed *= 0.55; other.speed += car.speed * 0.2;
        if (onCrash) onCrash(rel);
      }
    }
  }
  // visuals: heading, wheel spin + steering, body roll
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.6;
  for (const w of car.wheels) w.rotation.x += spin;
  for (const w of car.frontWheels) w.rotation.y = -car.steer * 0.42;
  car.mesh.rotation.z = -car.steer * clamp(Math.abs(car.speed) / 40, 0, 1) * 0.05;
  car.mesh.rotation.x = clamp(-(input.throttle * Math.abs(car.speed)) * 0.0009, -0.03, 0.03);
  // skid marks + dust when sliding hard
  const lateral = Math.abs(turnRate * car.speed);
  if ((input.handbrake && Math.abs(car.speed) > 6) || lateral > 13) {
    car.skidAcc += dt;
    if (car.skidAcc > 0.03) {
      car.skidAcc = 0;
      const back = { x: car.mesh.position.x - Math.sin(car.heading) * car.len * 0.36, z: car.mesh.position.z - Math.cos(car.heading) * car.len * 0.36 };
      addSkid(back.x, back.z, car.heading, Math.abs(car.speed) * 0.05);
      if (rng() < 0.4) burst.dust(car.mesh.position, 1);
    }
  }
  // damage smoke / fire
  if (car.health < 45) {
    car.smokeAcc += dt;
    if (car.smokeAcc > 0.12) { car.smokeAcc = 0; burst.smoke(car.mesh.position, 1); }
    if (car.health <= 0 && !car.dead) {
      car.health = 0; car.speed = 0;
      burst.sparks(car.mesh.position, 26); burst.smoke(car.mesh.position, 14);
      addShake(0.5); sfx.crash(true);
    }
  }
  return crashed;
}

export function nearestCarTo(pos, maxDist, onlyFree = false) {
  let best = null, bd = maxDist;
  for (const c of cars) {
    if (c.dead) continue;
    if (onlyFree && c.driver) continue;
    const d = Math.hypot(c.mesh.position.x - pos.x, c.mesh.position.z - pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
export function carSpeedKmh(car) { return Math.abs(car.speed) * 3.6; }
