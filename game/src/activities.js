// activities.js — everything to do in Azahar Bay between story jobs. One job: own the
// side content — repeatable taxi fares, two checkpoint race courses, the 20 lost
// charter tokens scattered over the city, and the occasional payphone "errand" —
// including their markers, timers, payouts and HUD text while one is running.

import * as THREE from 'three';
import { S, rand, randi, pick, clamp, dist2d, ROAD_LINES } from './config.js';
import { setObjective, toast, banner } from './hud.js';
import { sfx } from './audio.js';
import { burst, floater } from './effects.js';
import { reportCrime } from './wanted.js';
import { saveGame } from './save.js';

let scene = null, api = null;
let active = null;      // {kind:'taxi'|'race'|'errand', phase, ...}
const tokenMeshes = [];
let tokenGroup = null;

// Lost charter tokens: brass medallions stamped with the Marisol anchor, dropped by
// careless charter crews all over the bay. Twenty in total; each pays $25 and a
// little respect for the finder, per Doña Carmen's standing offer.
export const TOKEN_SPOTS = [
  { x: 23, z: 30, where: 'Plaza Central fountain' },
  { x: -178, z: 128, where: 'Marina office steps' },
  { x: 96, z: 252, where: 'Azahar Beach, east umbrellas' },
  { x: -120, z: 262, where: 'Azahar Beach, west end' },
  { x: 200, z: -160, where: 'Puerto Industrial cranes' },
  { x: -60, z: -196, where: 'Colinas Heights lookout' },
  { x: 138, z: 92, where: 'Barrio Palmas market corner' },
  { x: -210, z: -46, where: 'Viejo Puerto alley mouth' },
  { x: 46, z: -46, where: 'Downtown, Torre Coral steps' },
  { x: -46, z: 92, where: 'Centro cinema corner' },
  { x: 230, z: 230, where: 'South-east beach path' },
  { x: -238, z: 180, where: 'Marina pier four' },
  { x: 120, z: -230, where: 'Colinas north gate' },
  { x: -138, z: -150, where: 'Old town chapel square' },
  { x: 70, z: 140, where: 'Beachfront hotel row' },
  { x: -20, z: -90, where: 'Downtown parking court' },
  { x: 184, z: 20, where: 'Barrio Palmas east wall' },
  { x: -92, z: 46, where: 'Centro radio station door' },
  { x: 46, z: -160, where: 'Colinas Heights palm court' },
  { x: -205, z: 235, where: 'West pier, charter docks' },
];

export const RACES = {
  regatta: {
    name: 'Night Regatta Run', time: 105,
    points: [
      { x: -138, z: 92 }, { x: -46, z: 184 }, { x: 92, z: 230 }, { x: 184, z: 138 },
      { x: 138, z: 46 }, { x: 46, z: -46 }, { x: -92, z: 0 }, { x: -170, z: 108 },
    ],
    reward: 0, // story mission pays its own reward
  },
  sprint: {
    name: 'Faro Sprint', time: 75,
    points: [
      { x: 46, z: 46 }, { x: 138, z: 92 }, { x: 230, z: 46 }, { x: 184, z: -92 },
      { x: 92, z: -46 }, { x: 0, z: -138 }, { x: -92, z: -46 }, { x: -46, z: 60 },
    ],
    reward: 300,
  },
};
export const RACE_STARTS = {
  sprint: { x: -46, z: 60 },
};

const FARE_NAMES = ['a chef with a knife roll', 'a diver smelling of salt', 'a wedding singer',
  'a retired boxer', 'a marine biologist', 'a salsa instructor', 'a nervous notary',
  'a yacht broker', 'a street artist', 'a lighthouse keeper', 'a poker dealer', 'a surf coach'];
const FARE_DESTS = [
  { x: 40, z: 252, name: 'Azahar Beach' }, { x: -170, z: 112, name: 'Marina del Sol' },
  { x: 96, z: -92, name: 'Centro' }, { x: -92, z: -184, name: 'Colinas Heights' },
  { x: 190, z: 40, name: 'Barrio Palmas' }, { x: 210, z: -150, name: 'Puerto Industrial' },
  { x: -190, z: -60, name: 'Viejo Puerto' }, { x: 14, z: 14, name: 'Plaza Central' },
];

export function initActivities(sc, actApi) {
  scene = sc; api = actApi;
  tokenGroup = new THREE.Group();
  scene.add(tokenGroup);
  const geo = new THREE.CylinderGeometry(0.85, 0.85, 0.22, 18);
  const mat = new THREE.MeshPhongMaterial({ color: 0xd8a928, shininess: 80, emissive: 0x442d00 });
  TOKEN_SPOTS.forEach((spot, i) => {
    if (S._tokenIds && S._tokenIds.has(i)) return;
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2.4;
    m.position.set(spot.x, 1.1, spot.z);
    m.userData.tokenId = i;
    tokenGroup.add(m);
    tokenMeshes.push(m);
  });
  // race start pillar for the Faro Sprint
  const startRing = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 8, 22),
    new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
  startRing.position.set(RACE_STARTS.sprint.x, 2.2, RACE_STARTS.sprint.z);
  startRing.name = 'race-start-sprint';
  scene.add(startRing);
}

export function activityMarkers() {
  const out = [];
  if (active && active.marker) out.push({ x: active.marker.x, z: active.marker.z, color: active.kind === 'taxi' ? '#ffe23e' : '#39d0ff' });
  if (!active) {
    out.push({ x: RACE_STARTS.sprint.x, z: RACE_STARTS.sprint.z, color: '#39d0ff' });
  }
  return out;
}
export function activityActive() { return !!active; }

// ---------- taxi fares ----------
export function startTaxiFare() {
  if (active) return false;
  const p = api.getPlayerPos();
  let pickup = null, bd = 1e9;
  for (const l of ROAD_LINES) for (const m of ROAD_LINES) {
    const d = dist2d(p.x, p.z, l, m);
    if (d > 30 && d < bd) { bd = d; pickup = { x: l + 5, z: m + 5 }; }
  }
  const dest = pick(FARE_DESTS);
  active = {
    kind: 'taxi', phase: 'pickup', marker: pickup, dest,
    passenger: pick(FARE_NAMES), tip: 100, damageAtStart: api.getPlayerCar() ? api.getPlayerCar().health : 100,
  };
  banner('Taxi fare', `${active.passenger} is waiting`, 1800);
  setObjective('Taxi fare', `Pick up ${active.passenger}`, 'Gold marker · keep the car in one piece for a tip');
  sfx.phone();
  return true;
}

// ---------- races ----------
export function startRace(raceId, onDone, onFail) {
  if (active) return false;
  const def = RACES[raceId];
  active = {
    kind: 'race', raceId, def, idx: 0, timeLeft: def.time,
    marker: def.points[0], onDone, onFail, story: raceId === 'regatta',
  };
  banner(def.name, `${def.points.length} checkpoints · ${def.time}s`, 2000);
  setObjective(def.name, `Checkpoint 1/${def.points.length}`, `${Math.ceil(def.time)}s on the clock`);
  return true;
}
export function startMissionRace(raceId, onDone, onFail) { return startRace(raceId, onDone, onFail); }

// ---------- payphone errands ----------
const ERRANDS = [
  { text: 'A crate "fell off a boat" at the west pier. Fetch it back to the marina office.', from: { x: -238, z: 200 }, to: { x: -178, z: 118 }, pay: 220 },
  { text: 'Documents at Plaza Central need to reach the Colinas vault before anyone reads them.', from: { x: 20, z: 20 }, to: { x: -60, z: -205 }, pay: 260 },
  { text: 'A singer in Barrio Palmas left her lucky microphone at the beach stage. Return it.', from: { x: 60, z: 255 }, to: { x: 150, z: 90 }, pay: 180 },
];
export function startErrand() {
  if (active) return false;
  const e = ERRANDS[randi(0, ERRANDS.length - 1)];
  active = { kind: 'errand', phase: 'fetch', marker: e.from, dest: e.to, pay: e.pay };
  toast(`<b>Payphone:</b> ${e.text}`);
  setObjective('Errand', 'Pick up the package', `Pays $${e.pay} on delivery`);
  sfx.phone();
  return true;
}

function endActivity() { active = null; }

export function updateActivities(dt, elapsed) {
  // spin tokens + collect
  const p = api.getPlayerPos();
  for (let i = tokenMeshes.length - 1; i >= 0; i--) {
    const m = tokenMeshes[i];
    m.rotation.z += dt * 1.8;
    m.position.y = 1.1 + Math.sin(elapsed * 2.2 + m.userData.tokenId) * 0.18;
    if (dist2d(p.x, p.z, m.position.x, m.position.z) < 2.1) {
      const id = m.userData.tokenId;
      tokenGroup.remove(m); tokenMeshes.splice(i, 1);
      S.tokensFound++;
      if (!S._tokenIds) S._tokenIds = new Set();
      S._tokenIds.add(id);
      S.cash += 25; S.respect += 0; // respect comes from story; tokens are cash + bragging
      sfx.pickup();
      burst.cash(p, 8);
      floater(new THREE.Vector3(p.x, 1.6, p.z), '+$25 token');
      toast(`<b>Charter token ${S.tokensFound}/20</b> — ${TOKEN_SPOTS[id].where}. +$25`);
      if (S.tokensFound === 20) { S.cash += 500; banner('All tokens found!', 'Doña Carmen pays a $500 finder bonus', 3200); }
      saveGame();
    }
  }
  if (!active) return;
  const car = api.getPlayerCar();
  if (active.kind === 'taxi') {
    if (active.phase === 'pickup') {
      if (car && dist2d(p.x, p.z, active.marker.x, active.marker.z) < 6.5 && Math.abs(car.speed) < 1.2) {
        active.phase = 'dropoff'; active.marker = active.dest;
        active.damageAtStart = car.health;
        sfx.cash();
        setObjective('Taxi fare', `Drive ${active.passenger} to ${active.dest.name}`, 'Clean driving earns the $60 tip');
        toast('<b>Passenger aboard.</b> Mind the paintwork.');
      }
    } else if (active.phase === 'dropoff') {
      if (car && dist2d(p.x, p.z, active.dest.x, active.dest.z) < 7 && Math.abs(car.speed) < 2) {
        const clean = car.health >= active.damageAtStart - 6;
        const fare = 90 + Math.round(dist2d(active.dest.x, active.dest.z, p.x, p.z) * 0); // base fare
        const pay = fare + (clean ? 60 : 0);
        S.cash += pay; S.taxiFaresDone++;
        sfx.cash(); burst.cash(p, 10);
        banner('Fare complete', clean ? `$${pay} — tip included` : `$${pay} — no tip, too many dents`, 2000);
        setObjective('Free roam', 'Taxi fares, the Faro Sprint and lost tokens pay cash', '');
        endActivity(); saveGame();
      } else if (!car) {
        toast('<b>Fare abandoned</b> — the passenger got out and walked.');
        endActivity(); setObjective('Free roam', '', '');
      }
    }
  } else if (active.kind === 'race') {
    active.timeLeft -= dt;
    const pt = active.def.points[active.idx];
    setObjective(active.def.name, `Checkpoint ${active.idx + 1}/${active.def.points.length}`,
      `${Math.max(0, Math.ceil(active.timeLeft))}s on the clock`);
    if (active.timeLeft <= 0) {
      const f = active.onFail; endActivity();
      if (f) f(); else { banner('Race failed', 'Out of time', 2200); setObjective('Free roam', '', ''); }
      return;
    }
    if (car && dist2d(p.x, p.z, pt.x, pt.z) < 7.5) {
      sfx.checkpoint(); burst.confetti(new THREE.Vector3(pt.x, 1, pt.z), 12);
      active.idx++;
      active.timeLeft += 9;
      if (active.idx >= active.def.points.length) {
        const d = active.onDone; const pay = active.def.reward; const nm = active.def.name;
        endActivity();
        if (pay) { S.cash += pay; S.racesWon++; sfx.missionDone(); banner('Race won!', `${nm} · +$${pay}`, 2600); saveGame(); }
        if (d) d();
        if (!pay) setObjective('Free roam', '', '');
      } else {
        active.marker = active.def.points[active.idx];
      }
    }
  } else if (active.kind === 'errand') {
    if (active.phase === 'fetch') {
      if (dist2d(p.x, p.z, active.marker.x, active.marker.z) < 4) {
        active.phase = 'deliver'; active.marker = active.dest;
        sfx.pickup(); burst.dust(p, 8);
        setObjective('Errand', 'Deliver the package', `Pays $${active.pay}`);
        reportCrime('propertyDamage', false);
      }
    } else if (dist2d(p.x, p.z, active.dest.x, active.dest.z) < 5) {
      S.cash += active.pay; sfx.cash();
      banner('Errand done', `+$${active.pay}`, 2000);
      setObjective('Free roam', '', '');
      endActivity(); saveGame();
    }
  }
}

// Activity prompts handled by main.js (it owns the interaction key).
export function nearActivityStart() {
  if (active) return null;
  const p = api.getPlayerPos();
  const car = api.getPlayerCar();
  if (car && car.type === 'taxi' && S.wanted === 0) return { kind: 'taxi', label: '<b>E</b> — Start taxi fare' };
  if (dist2d(p.x, p.z, RACE_STARTS.sprint.x, RACE_STARTS.sprint.z) < 6 && car) {
    return { kind: 'race', label: '<b>E</b> — Start the Faro Sprint race' };
  }
  if (!car && dist2d(p.x, p.z, 30, -30) < 3.4) return { kind: 'errand', label: '<b>E</b> — Answer the payphone' };
  return null;
}
export function runActivityStart(kind) {
  if (kind === 'taxi') startTaxiFare();
  else if (kind === 'race') startRace('sprint', null, null);
  else if (kind === 'errand') startErrand();
}
export { clamp as _c2 };
