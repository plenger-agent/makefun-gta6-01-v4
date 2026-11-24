// minimap.js — the circular-corner canvas minimap. One job: draw the city from above
// every frame, cheaply: pre-rendered road/block base image, then live blips for the
// player (white arrow), traffic (grey), police (flashing red/blue), pedestrians
// (faint dots), the mission marker (gold), taxi/race/collectible markers, and a
// north-up rotating view centred on the player.

import { ROAD_LINES, ROAD_HALF, CITY_MIN, BAY_Z, WATER_Z, S } from './config.js';

let canvas = null, ctx = null, base = null;
const VIEW = 150; // world units visible across the minimap

export function initMinimap() {
  canvas = document.getElementById('minimap');
  ctx = canvas.getContext('2d');
  // pre-render the static base: water, sand, blocks, roads
  base = document.createElement('canvas');
  base.width = base.height = 560;
  const b = base.getContext('2d');
  const W2C = (v) => ((v - CITY_MIN) / (560 - CITY_MIN)) * 560; // world->base px (approx via scale below)
  void W2C;
  const scale = 560 / 620;
  const ox = (w) => (w + 310) * scale;
  b.fillStyle = '#274b63'; b.fillRect(0, 0, 560, 560);                    // water
  b.fillStyle = '#3f7d46'; b.fillRect(0, 0, 560, ox(BAY_Z + 30));         // land
  b.fillStyle = '#e3cf9e'; b.fillRect(0, ox(BAY_Z), 560, ox(WATER_Z) - ox(BAY_Z)); // sand
  b.fillStyle = '#8f8a80'; b.fillRect(ox(CITY_MIN - 10), ox(CITY_MIN - 10), ox(262) - ox(CITY_MIN - 10), ox(BAY_Z) - ox(CITY_MIN - 10)); // city slab
  b.fillStyle = '#33343c';
  for (const l of ROAD_LINES) {
    b.fillRect(ox(l - ROAD_HALF), ox(CITY_MIN), ROAD_HALF * 2 * scale, ox(BAY_Z) - ox(CITY_MIN));
    b.fillRect(ox(CITY_MIN), ox(l - ROAD_HALF), ox(BAY_Z) - ox(CITY_MIN), ROAD_HALF * 2 * scale);
  }
  b.fillStyle = '#b59a78'; b.fillRect(ox(6), ox(6), 34 * scale, 34 * scale); // plaza
}

function blip(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

export function drawMinimap(state) {
  if (!ctx) return;
  const { playerPos, heading, cars, copCars, peds, markers } = state;
  const size = canvas.width, half = size / 2;
  const scale = size / VIEW;
  ctx.clearRect(0, 0, size, size);
  // base image, centred + rotated so the player faces up: with world forward
  // (sin h, cos h), a heading-up view is a canvas rotation of h + PI, and blips use
  // the matching point transform below (verified against the four headings).
  ctx.save();
  ctx.translate(half, half);
  ctx.rotate(heading + Math.PI);
  const bScale = (560 / 620) * scale;
  ctx.scale(bScale, bScale);
  ctx.translate(-(playerPos.x + 310), -(playerPos.z + 310));
  ctx.drawImage(base, 0, 0);
  ctx.restore();
  const toMap = (wx, wz) => {
    const dx = wx - playerPos.x, dz = wz - playerPos.z;
    const c = Math.cos(heading), s = Math.sin(heading);
    return {
      x: half + (dz * s - dx * c) * scale,
      y: half + (-dx * s - dz * c) * scale,
      off: Math.abs(dx) > VIEW || Math.abs(dz) > VIEW,
    };
  };
  // peds (faint)
  if (peds) for (const ped of peds) {
    const m = toMap(ped.mesh.position.x, ped.mesh.position.z);
    if (!m.off) blip(m.x, m.y, 1.6, 'rgba(255,255,255,.45)');
  }
  // traffic
  if (cars) for (const car of cars) {
    if (car.driver === 'police' || car === S.inCar) continue;
    const m = toMap(car.mesh.position.x, car.mesh.position.z);
    if (!m.off) blip(m.x, m.y, 2.2, '#c9ced6');
  }
  // police flash
  const flash = Math.floor(performance.now() / 300) % 2 === 0;
  if (copCars) for (const cop of copCars) {
    const m = toMap(cop.mesh.position.x, cop.mesh.position.z);
    if (!m.off) blip(m.x, m.y, 3.4, flash ? '#ff3b4e' : '#3b82ff');
  }
  // markers
  if (markers) for (const mk of markers) {
    const m = toMap(mk.x, mk.z);
    const cx = Math.max(8, Math.min(size - 8, m.x)), cy = Math.max(8, Math.min(size - 8, m.y));
    ctx.fillStyle = mk.color || '#ffd23e';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 5, cy + 4); ctx.lineTo(cx - 5, cy + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // player arrow (always centre, facing up)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(half, half - 7); ctx.lineTo(half + 5, half + 6); ctx.lineTo(half, half + 2.6); ctx.lineTo(half - 5, half + 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // wanted tint ring
  if (S.wanted > 0) {
    ctx.strokeStyle = flash ? 'rgba(255,60,60,.85)' : 'rgba(255,190,40,.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  }
}
