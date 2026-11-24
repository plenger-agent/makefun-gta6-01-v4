// traffic.js — ambient traffic AI for Azahar Heat. One job: keep a capped pool of
// civilian cars circulating the road grid — lane-keeping, slowing for the car ahead,
// turning at intersections, honking when blocked, and politely despawning far away so
// the streets near the player always feel alive without costing frames.

import { ROAD_LINES, ROAD_HALF, rng, rand, pick, clamp } from './config.js';
import { spawnCar, removeCar, cars, driveCar } from './vehicles.js';
import { TRAFFIC_TYPES } from './config.js';

const MAX_TRAFFIC = 13;
const LANE = 3.4;               // right-hand lane offset from the centre line
const traffic = [];
let playerPosRef = null;

export function initTraffic(getPlayerPos) {
  playerPosRef = getPlayerPos;
  for (let i = 0; i < 9; i++) spawnTraffic(true);
}

function roadPoint(anywhere) {
  const vertical = rng() < 0.5;
  const line = pick(ROAD_LINES);
  const along = rand(-235, 235);
  const p = playerPosRef ? playerPosRef() : { x: 0, z: 0 };
  let x, z, heading;
  if (vertical) { // travelling along z on a vertical road (constant x)
    const dir = rng() < 0.5 ? 1 : -1;
    x = line + (dir > 0 ? -LANE : LANE);
    z = anywhere ? along : clamp(p.z + rand(-160, 160) * (rng() < 0.5 ? -1 : 1), -240, 240);
    heading = dir > 0 ? 0 : Math.PI;
  } else {
    const dir = rng() < 0.5 ? 1 : -1;
    z = line + (dir > 0 ? LANE : -LANE);
    x = anywhere ? along : clamp(p.x + rand(-160, 160) * (rng() < 0.5 ? -1 : 1), -240, 240);
    heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return { x, z, heading };
}

function spawnTraffic(anywhere = false) {
  const { x, z, heading } = roadPoint(anywhere);
  if (playerPosRef) {
    const p = playerPosRef();
    if (Math.hypot(x - p.x, z - p.z) < 16) return null;
  }
  const car = spawnCar(pick(TRAFFIC_TYPES), x, z, heading, { driver: 'traffic' });
  car.ai = { cruise: rand(8.5, 13.5), turnCd: rand(1, 4), blocked: 0 };
  traffic.push(car);
  return car;
}

function nearestIntersection(x, z) {
  let bx = null, bz = null, bd = 1e9;
  for (const lx of ROAD_LINES) for (const lz of ROAD_LINES) {
    const d = Math.hypot(x - lx, z - lz);
    if (d < bd) { bd = d; bx = lx; bz = lz; }
  }
  return { x: bx, z: bz, d: bd };
}

export function updateTraffic(dt) {
  const p = playerPosRef ? playerPosRef() : { x: 0, z: 0 };
  // maintain population near the player
  for (let i = traffic.length - 1; i >= 0; i--) {
    const c = traffic[i];
    const d = Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z);
    if (c.dead || c.driver !== 'traffic' || d > 260) {
      if (!c.dead && c.driver === 'traffic') removeCar(c);
      traffic.splice(i, 1);
    }
  }
  while (traffic.length < MAX_TRAFFIC) { if (!spawnTraffic()) break; }

  for (const car of traffic) {
    const pos = car.mesh.position;
    const ai = car.ai;
    ai.turnCd -= dt;
    // look ahead: slow for anything in front
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let want = ai.cruise;
    let blocked = false;
    for (const other of cars) {
      if (other === car || other.dead) continue;
      const dx = other.mesh.position.x - pos.x, dz = other.mesh.position.z - pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 9 && side < 2.4) { want = Math.min(want, Math.max(0, (ahead - 5.5) * 1.4)); blocked = ahead < 6.5; }
    }
    const pd = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (pd < 60) {
      const aheadP = (p.x - pos.x) * fx + (p.z - pos.z) * fz;
      const sideP = Math.abs((p.x - pos.x) * fz - (p.z - pos.z) * fx);
      if (aheadP > 0 && aheadP < 8 && sideP < 2.2) { want = 0; blocked = true; }
    }
    // intersection turns
    const inter = nearestIntersection(pos.x, pos.z);
    let steer = 0;
    if (inter.d < ROAD_HALF + 3 && ai.turnCd <= 0 && rng() < 0.012) {
      const turn = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      car.heading += turn;
      // snap into the correct lane of the new road
      ai.turnCd = rand(2.5, 6);
    }
    // lane keeping: aim at a point on the correct lane a few metres ahead, so cars
    // settle back onto their lane after turns and nudges instead of drifting.
    const aheadX = pos.x + Math.sin(car.heading) * 7, aheadZ = pos.z + Math.cos(car.heading) * 7;
    let laneErr = 0;
    if (Math.abs(Math.sin(car.heading)) < 0.5) {
      // travelling along z: the lane belongs to the nearest vertical road line
      let bl = ROAD_LINES[0], bd = 1e9;
      for (const l of ROAD_LINES) { const d = Math.abs(pos.x - l); if (d < bd) { bd = d; bl = l; } }
      const dirSign = Math.cos(car.heading) > 0 ? 1 : -1;
      laneErr = (bl + (dirSign > 0 ? -LANE : LANE)) - aheadX;
      steer = clamp(laneErr * 0.06, -0.5, 0.5);
    } else {
      let bl = ROAD_LINES[0], bd = 1e9;
      for (const l of ROAD_LINES) { const d = Math.abs(pos.z - l); if (d < bd) { bd = d; bl = l; } }
      const dirSign = Math.sin(car.heading) > 0 ? 1 : -1;
      laneErr = (bl + (dirSign > 0 ? LANE : -LANE)) - aheadZ;
      steer = clamp(-laneErr * 0.06 * dirSign, -0.5, 0.5);
    }
    // gentle lane correction toward the road centre-line lane
    const input = {
      throttle: car.speed < want ? 0.75 : (car.speed > want + 1 ? -0.4 : 0),
      steer, handbrake: false,
    };
    if (want === 0 && car.speed > 0.5) input.throttle = -0.55;
    driveCar(car, input, dt, null);
    // honk when stuck behind something
    if (blocked) {
      ai.blocked += dt;
      car.hornCd -= dt;
      if (ai.blocked > 1.2 && car.hornCd <= 0) { car.hornCd = rand(3, 8); import('./audio.js').then((m) => m.sfx.horn()); }
    } else ai.blocked = 0;
    void steer;
  }
}

export function trafficCount() { return traffic.length; }
