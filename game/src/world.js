// world.js — builds the city of Azahar Bay: ground, road grid, sidewalks, five districts
// of buildings with signage, palms, lamps, beach + ocean, marina piers, a plaza and
// scattered props. One job: own the static world geometry, its colliders, and the
// day/night lighting rig. Nothing here moves except light, water and flags.

import * as THREE from 'three';
import {
  ROAD_LINES, ROAD_HALF, SIDEWALK, CITY_MIN, CITY_MAX, BAY_Z, WATER_Z,
  SHOP_NAMES, TOWER_NAMES, rng, rand, pick, clamp, districtAt,
} from './config.js';

export const colliders = [];        // {minX,maxX,minZ,maxZ} AABBs for buildings/props
export const lampPositions = [];
export const palmPositions = [];
export let scene, sunLight, hemiLight, skyMesh, waterMesh, lampGlowMat, headlightSpots = [];
const lampHeads = [];
let flagMats = [];

const MAT = {
  asphalt: new THREE.MeshLambertMaterial({ color: 0x33343c }),
  asphaltLine: new THREE.MeshBasicMaterial({ color: 0xd8c95a }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x9b968c }),
  grass: new THREE.MeshLambertMaterial({ color: 0x4d7d43 }),
  sand: new THREE.MeshLambertMaterial({ color: 0xe3cf9e }),
  plaza: new THREE.MeshLambertMaterial({ color: 0xb59a78 }),
  water: new THREE.MeshPhongMaterial({ color: 0x14607e, shininess: 90, transparent: true, opacity: 0.92 }),
  palmTrunk: new THREE.MeshLambertMaterial({ color: 0x8a6b45 }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x2e8b57 }),
  lampPole: new THREE.MeshLambertMaterial({ color: 0x2b2f36 }),
  container: [0xb5502e, 0x2e6db5, 0x3f9e4d, 0xc2a227, 0x7a4fa3].map((c) => new THREE.MeshLambertMaterial({ color: c })),
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);

function box(mat, w, h, d, x, y, z, parent, shadow = false) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  (parent || scene).add(m);
  return m;
}
function addCollider(x, z, w, d) {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

const WALL_COLORS = {
  downtown: [0x8fa3b8, 0x6f87a0, 0xb8c4cf, 0x5d748c, 0xa8b6a4],
  beach: [0xf2e3c6, 0xf5c6a5, 0xbfe3dd, 0xf7d774, 0xffffff],
  marina: [0xe8e4da, 0xc9d6df, 0xf0ead6, 0xd9c9a8],
  suburb: [0xe6cfa8, 0xd9b48f, 0xcfe0c0, 0xf0e0cc, 0xe8b4b8],
  industrial: [0x9a8f80, 0x7d7468, 0x8b95a1, 0xa39a8a],
  oldtown: [0xd9a066, 0xc97b4a, 0xe3c08d, 0xb56a4c],
};
const ROOF_COLORS = [0x6b4a35, 0x54504a, 0x7a3b2e, 0x3f4a52, 0x8a7a5f];
const windowMatDay = new THREE.MeshBasicMaterial({ color: 0x2c4256 });
const windowMatNight = new THREE.MeshBasicMaterial({ color: 0xffca7a });

function building(x, z, w, d, h, palette, name) {
  const g = new THREE.Group();
  const wall = new THREE.MeshLambertMaterial({ color: pick(palette) });
  const body = box(wall, w, h, d, 0, h / 2, 0, g, true);
  body.receiveShadow = true;
  box(new THREE.MeshLambertMaterial({ color: pick(ROOF_COLORS) }), w + 0.5, 0.5, d + 0.5, 0, h + 0.25, 0, g);
  // window strips on the street-facing sides, every other floor: reads as a fully
  // glazed facade from the street at half the mesh count (perf budget matters more
  // than countable windows — the strips share one material and one geometry).
  const floors = Math.max(1, Math.floor(h / 3.4));
  const winMat = new THREE.MeshBasicMaterial({ color: 0x33475e });
  for (let f = 0; f < floors; f += 2) {
    const y = 1.9 + f * 3.4;
    if (y > h - 1) break;
    box(winMat, w * 0.82, 1.5, 0.12, 0, y, d / 2 + 0.06, g);
    box(winMat, w * 0.82, 1.5, 0.12, 0, y, -d / 2 - 0.06, g);
  }
  // shop awning + sign at street level for low buildings
  if (h < 13 && name) {
    const awn = box(new THREE.MeshLambertMaterial({ color: pick([0xc0392b, 0x2471a3, 0x229954, 0xba4a00, 0x7d3c98]) }),
      w * 0.7, 0.25, 2.2, 0, 3.1, d / 2 + 1, g);
    awn.rotation.x = 0.18;
    const sign = makeSign(name, Math.min(w * 0.85, 11));
    sign.position.set(0, 4.1, d / 2 + 0.25);
    g.add(sign);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x, z, w, d);
  return g;
}

function makeSign(text, width = 9) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = '#18122b'; g.fillRect(0, 0, 512, 72);
  g.strokeStyle = '#ffb347'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 64);
  g.fillStyle = '#ffd9a0'; g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 38);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 72 / 512),
    new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

function palm(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(cylGeo, MAT.palmTrunk);
  trunk.scale.set(0.22 * s, 5.2 * s, 0.22 * s);
  trunk.position.y = 2.6 * s; trunk.rotation.z = rand(-0.09, 0.09);
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = box(MAT.palmLeaf, 3.4 * s, 0.08, 0.7 * s, 0, 5.3 * s, 0, g);
    leaf.position.x = Math.cos(i * 1.047) * 1.4 * s;
    leaf.position.z = Math.sin(i * 1.047) * 1.4 * s;
    leaf.rotation.y = -i * 1.047; leaf.rotation.z = 0.5;
  }
  g.position.set(x, 0, z);
  scene.add(g);
  palmPositions.push({ x, z });
  addCollider(x, z, 0.7, 0.7);
}

function lamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(cylGeo, MAT.lampPole);
  pole.scale.set(0.09, 5.6, 0.09); pole.position.y = 2.8;
  g.add(pole);
  lampGlowMat = lampGlowMat || new THREE.MeshBasicMaterial({ color: 0x554e33 });
  const head = box(lampGlowMat, 0.55, 0.18, 0.55, 0, 5.65, 0, g);
  lampHeads.push(head);
  g.position.set(x, 0, z);
  scene.add(g);
  lampPositions.push({ x, z });
}

function buildGroundAndRoads() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), MAT.grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  scene.add(ground);
  // city slab
  box(MAT.sidewalk, CITY_MAX - CITY_MIN + 30, 0.1, BAY_Z - CITY_MIN + 15, 0, 0, (CITY_MIN + BAY_Z) / 2, scene).receiveShadow = true;
  // roads: long strips along each grid line
  for (const l of ROAD_LINES) {
    const h = box(MAT.asphalt, ROAD_HALF * 2, 0.06, BAY_Z - CITY_MIN, l, 0.03, (CITY_MIN + BAY_Z) / 2, scene);
    h.receiveShadow = true;
    const v = box(MAT.asphalt, BAY_Z - CITY_MIN, 0.06, ROAD_HALF * 2, (CITY_MIN + BAY_Z) / 2 - 7, 0.03, l, scene);
    v.receiveShadow = true;
    // dashed centre lines
    for (let t = CITY_MIN + 8; t < BAY_Z - 6; t += 9) {
      if (ROAD_LINES.some((o) => Math.abs(o - t) < ROAD_HALF + 2)) continue;
      box(MAT.asphaltLine, 0.35, 0.02, 3.6, l, 0.08, t, scene);
      box(MAT.asphaltLine, 3.6, 0.02, 0.35, t, 0.08, l, scene);
    }
  }
  // Plaza Central around origin block
  box(MAT.plaza, 34, 0.09, 34, 23, 0.02, 23, scene).receiveShadow = true;
  // beach + ocean
  box(MAT.sand, 1400, 0.08, 46, 0, 0.0, BAY_Z + 20, scene).receiveShadow = true;
  waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), MAT.water);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, 0.12, WATER_Z + 340);
  scene.add(waterMesh);
  // marina piers on the west beach
  for (let i = 0; i < 4; i++) {
    box(new THREE.MeshLambertMaterial({ color: 0x8a6f4d }), 3, 0.5, 42, -190 + i * 26, 0.35, WATER_Z + 16, scene);
  }
}

function buildBlocks() {
  let shopIdx = 0, towerIdx = 0;
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x0 = ROAD_LINES[i] + ROAD_HALF + SIDEWALK, x1 = ROAD_LINES[i + 1] - ROAD_HALF - SIDEWALK;
      const z0 = ROAD_LINES[j] + ROAD_HALF + SIDEWALK, z1 = ROAD_LINES[j + 1] - ROAD_HALF - SIDEWALK;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bw = x1 - x0, bd = z1 - z0;
      if (Math.abs(cx) < 30 && Math.abs(cz) < 30) continue; // Plaza Central stays open
      const dist = districtAt(cx, cz);
      const downtown = dist === 'Downtown Azahar';
      const industrial = dist === 'Puerto Industrial';
      const suburb = dist === 'Colinas Heights' || dist === 'Barrio Palmas';
      if (industrial && rng() < 0.5) {
        // warehouse yard: one long shed + containers
        building(cx, cz, bw * 0.8, bd * 0.55, rand(6, 9), WALL_COLORS.industrial, null);
        for (let k = 0; k < 4; k++) {
          const px = x0 + rand(4, bw - 4), pz = z1 - rand(2, 6);
          const cont = box(pick(MAT.container), 6, 2.6, 2.4, px, 1.3, pz, scene, true);
          cont.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
          addCollider(px, pz, 6.2, 2.6);
        }
        continue;
      }
      if (suburb && rng() < 0.55) {
        // houses: 2x2 small homes with pitched roofs + a tree/palm
        for (const [hx, hz] of [[x0 + bw * 0.27, z0 + bd * 0.27], [x0 + bw * 0.73, z0 + bd * 0.27], [x0 + bw * 0.27, z0 + bd * 0.73], [x0 + bw * 0.73, z0 + bd * 0.73]]) {
          const h = rand(3.4, 4.6);
          building(hx, hz, 8.5, 7.5, h, WALL_COLORS.suburb, null);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.2, 4), new THREE.MeshLambertMaterial({ color: pick(ROOF_COLORS) }));
          roof.position.set(hx, h + 1.1, hz); roof.rotation.y = Math.PI / 4; roof.castShadow = true;
          scene.add(roof);
        }
        palm(cx + rand(-6, 6), cz + rand(-6, 6), rand(0.8, 1.05));
        continue;
      }
      // default: 1 big tower or 2 mid buildings per block
      if (downtown || rng() < 0.4) {
        const name = downtown ? TOWER_NAMES[towerIdx++ % TOWER_NAMES.length] : null;
        building(cx, cz, bw * rand(0.62, 0.78), bd * rand(0.62, 0.78),
          downtown ? rand(22, 46) : rand(9, 18),
          downtown ? WALL_COLORS.downtown : WALL_COLORS.oldtown, name);
      } else {
        const palette = dist === 'Azahar Beach' || cz > 120 ? WALL_COLORS.beach
          : dist === 'Marina del Sol' ? WALL_COLORS.marina : WALL_COLORS.oldtown;
        building(x0 + bw * 0.26, cz, bw * 0.4, bd * 0.8, rand(6, 12), palette, SHOP_NAMES[shopIdx++ % SHOP_NAMES.length]);
        building(x0 + bw * 0.74, cz, bw * 0.4, bd * 0.8, rand(6, 12), palette, SHOP_NAMES[shopIdx++ % SHOP_NAMES.length]);
      }
      // block dressing: palms on sunny blocks, lamps on corners
      if (rng() < 0.6) palm(x0 + rand(1, 4), z0 + rand(1, 4), rand(0.85, 1.2));
      if (rng() < 0.5) palm(x1 - rand(1, 4), z1 - rand(1, 4), rand(0.85, 1.2));
    }
  }
  // beach palms + umbrellas
  for (let x = -240; x <= 240; x += rand(14, 26)) {
    palm(x, BAY_Z + rand(4, 16), rand(0.9, 1.3));
    if (rng() < 0.6) {
      const um = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.8, 8),
        new THREE.MeshLambertMaterial({ color: pick([0xe74c3c, 0xf39c12, 0x1abc9c, 0xecf0f1]) }));
      um.position.set(x + rand(3, 7), 2.1, BAY_Z + rand(8, 24));
      um.castShadow = true; scene.add(um);
      const pole = new THREE.Mesh(cylGeo, MAT.lampPole);
      pole.scale.set(0.05, 2.1, 0.05); pole.position.set(um.position.x, 1.05, um.position.z);
      scene.add(pole);
    }
  }
  // street lamps at intersections
  for (const lx of ROAD_LINES) for (const lz of ROAD_LINES) {
    lamp(lx + ROAD_HALF + 1.2, lz + ROAD_HALF + 1.2);
    lamp(lx - ROAD_HALF - 1.2, lz - ROAD_HALF - 1.2);
  }
  // Plaza fountain + statue plinth
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 20), new THREE.MeshLambertMaterial({ color: 0x7f8c9b }));
  basin.position.set(23, 0.4, 23); basin.castShadow = true; scene.add(basin);
  const waterTop = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.2, 20), MAT.water);
  waterTop.position.set(23, 0.75, 23); scene.add(waterTop);
  addCollider(23, 23, 10.5, 10.5);
  // flags over the plaza
  const flagCols = [0xe74c3c, 0xf39c12, 0x1abc9c];
  for (let i = 0; i < 3; i++) {
    const pole = new THREE.Mesh(cylGeo, MAT.lampPole);
    pole.scale.set(0.07, 8, 0.07); pole.position.set(10 + i * 13, 4, 8); scene.add(pole);
    const fm = new THREE.MeshBasicMaterial({ color: flagCols[i], side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5, 6, 1), fm);
    flag.position.set(11.35 + i * 13, 7.2, 8); scene.add(flag);
    flagMats.push(fm); flagMats[flagMats.length - 1]._mesh = flag;
  }
}

export function buildWorld(sc) {
  scene = sc;
  scene.fog = new THREE.Fog(0xf2c98a, 120, 620);
  hemiLight = new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.85);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffe3b3, 1.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -90; sunLight.shadow.camera.right = 90;
  sunLight.shadow.camera.top = 90; sunLight.shadow.camera.bottom = -90;
  sunLight.shadow.camera.far = 420;
  scene.add(sunLight); scene.add(sunLight.target);
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(880, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x87b5d9, side: THREE.BackSide, fog: false }));
  scene.add(skyMesh);
  buildGroundAndRoads();
  buildBlocks();
  return { colliders };
}

// Resolve a circle (x,z,r) against building AABBs and the world bounds.
export function collideCircle(pos, r) {
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - r; else if (m === pr) pos.x = c.maxX + r;
        else if (m === pt) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
      }
    }
  }
  pos.x = clamp(pos.x, CITY_MIN - 60, CITY_MAX + 60);
  pos.z = clamp(pos.z, CITY_MIN - 40, WATER_Z + 26);
  return pos;
}

// Day/night: t01 = 0 at midnight, 0.5 at noon. Drives sun, sky, fog, lamp glow.
const SKY_DAY = new THREE.Color(0x87b5d9), SKY_DUSK = new THREE.Color(0xf28c5a),
  SKY_NIGHT = new THREE.Color(0x101a33), _c = new THREE.Color();
export function updateWorld(dt, timeMin, focusPos, elapsed) {
  const t = (timeMin % 1440) / 1440;
  const sunAng = (t - 0.25) * Math.PI * 2; // sunrise ~06:00
  const elev = Math.sin(sunAng);
  const dayAmt = clamp(elev * 2.2 + 0.25, 0, 1);
  const duskAmt = clamp(1 - Math.abs(elev) * 2.6, 0, 1) * (elev > -0.25 ? 1 : 0);
  _c.copy(SKY_NIGHT).lerp(SKY_DAY, dayAmt).lerp(SKY_DUSK, duskAmt * 0.55);
  skyMesh.material.color.copy(_c);
  scene.fog.color.copy(_c).lerp(new THREE.Color(0xffffff), 0.12);
  scene.background = _c;
  sunLight.intensity = 0.12 + dayAmt * 1.5;
  sunLight.color.setHSL(0.1, 0.55, 0.55 + dayAmt * 0.2);
  const sd = 160;
  sunLight.position.set(focusPos.x + Math.cos(sunAng) * sd, Math.max(elev, 0.06) * sd + 24, focusPos.z + Math.sin(sunAng * 0.7) * 60);
  sunLight.target.position.copy(focusPos);
  hemiLight.intensity = 0.22 + dayAmt * 0.65;
  const night = dayAmt < 0.25;
  if (lampGlowMat) lampGlowMat.color.setHex(night ? 0xffca7a : 0x554e33);
  if (waterMesh) { waterMesh.position.y = 0.12 + Math.sin(elapsed * 0.7) * 0.05; waterMesh.material.opacity = 0.9; }
  for (const fm of flagMats) {
    if (fm._mesh) fm._mesh.rotation.y = Math.sin(elapsed * 2.2 + fm._mesh.position.x) * 0.28;
  }
  return { dayAmt, night, elev };
}

export function isOnRoad(x, z) {
  for (const l of ROAD_LINES) if (Math.abs(x - l) < ROAD_HALF + 1) return true;
  for (const l of ROAD_LINES) if (Math.abs(z - l) < ROAD_HALF + 1) return true;
  return false;
}
export function nearestRoadPoint(x, z) {
  let best = null, bd = 1e9;
  for (const l of ROAD_LINES) { const d = Math.abs(x - l); if (d < bd) { bd = d; best = { x: l, z }; } }
  for (const l of ROAD_LINES) { const d = Math.abs(z - l); if (d < bd) { bd = d; best = { x, z: l }; } }
  return best;
}
export { makeSign };
