// missions.js — the AZAHAR HEAT story campaign: six chained missions for the Marisol
// charter family, plus the mission engine that runs them. One job: own the story
// script (characters, dialogue, objectives), the step state machine (talk → go-to →
// drive/deliver → chase → escape), the 3D objective beacon, and rewards/progression.
// Side activities live in activities.js; this file is story only.
//
// Cast (all original):
//   Rafa Cordero — the player, a wheelman back in Azahar Bay after six years away.
//   Doña Carmen Marisol — matriarch of Marisol Charters, runs the marina and more.
//   Tito Marisol — her nephew, big heart, terrible plans.
//   Inspectora Vega — ABPD detective who has waited years for Rafa to slip.
//   "El Contable" (the Accountant) — a rival syndicate's money man, never seen clean.

import * as THREE from 'three';
import { S, clamp, dist2d } from './config.js';
import { setObjective, playDialogue, dialogueActive, banner, toast } from './hud.js';
import { reportCrime, setWanted, clearWanted } from './wanted.js';
import { saveGame } from './save.js';
import { sfx } from './audio.js';
import { burst } from './effects.js';
import { healPlayer } from './combat.js';

let scene = null, beacon = null, beaconRing = null;
let api = null; // { getPlayerPos, getPlayerCar, spawnMissionCar, teleportOk }
let current = null; // active mission runtime { def, stepIdx, data }
let markerPos = null;

export const STORY = [
  {
    id: 'm1-homecoming', title: 'Homecoming', giver: 'Doña Carmen',
    start: { x: -178, z: 118 }, // Marina del Sol office
    intro: [
      { who: 'Doña Carmen', line: 'Rafa Cordero. Six years, and the tide finally throws you back on my dock.' },
      { who: 'Rafa', line: 'The tide had help, Carmen. A debt collector with a boat hook.' },
      { who: 'Doña Carmen', line: 'Then work it off. My nephew Tito left the charter books in a Víbora at the beach car park. Bring the car — and the books — back to me.' },
      { who: 'Rafa', line: 'Steal back your own car. Some homecoming.' },
    ],
    steps: [
      { kind: 'goto', at: { x: 60, z: 246 }, text: 'Reach the beach car park', sub: 'The Víbora GT is parked by the sand' },
      { kind: 'enterCar', carType: 'sports', text: 'Take the Víbora GT', sub: 'Press E near the car' },
      { kind: 'deliver', at: { x: -178, z: 118 }, text: 'Deliver the Víbora to the marina', sub: 'Doña Carmen is waiting', crime: 'carTheft' },
    ],
    reward: 350, respect: 1,
    outro: [
      { who: 'Doña Carmen', line: 'Books intact. Car intact. You still drive like the road owes you money.' },
      { who: 'Rafa', line: 'It does. Everyone in this town does.' },
    ],
  },
  {
    id: 'm2-fare-warning', title: 'A Fare Warning', giver: 'Tito Marisol',
    start: { x: -170, z: 108 },
    intro: [
      { who: 'Tito', line: '¡Rafa! Tía Carmen says you are family now. Family helps family — my cab shift starts in ten and I am… indisposed.' },
      { who: 'Rafa', line: 'Indisposed means the casino, Tito.' },
      { who: 'Tito', line: 'Three fares are waiting across town. Pick them up, drop them off, and whatever you do — do not scratch the cab. It is also my house.' },
    ],
    steps: [
      { kind: 'enterCar', carType: 'taxi', text: 'Get into Tito\'s Radio Cab', sub: 'Parked outside the marina office' },
      { kind: 'pickup', at: { x: 96, z: -92 }, text: 'Pick up fare 1: a chef in Centro', sub: 'Stop in the gold ring' },
      { kind: 'dropoff', at: { x: -92, z: -184 }, text: 'Drop the chef at Colinas Heights', sub: '' },
      { kind: 'pickup', at: { x: 190, z: 40 }, text: 'Pick up fare 2: a diver in Barrio Palmas', sub: 'Stop in the gold ring' },
      { kind: 'dropoff', at: { x: 40, z: 252 }, text: 'Drop the diver at Azahar Beach', sub: '' },
      { kind: 'pickup', at: { x: -190, z: -60 }, text: 'Pick up fare 3: a nervous accountant, Viejo Puerto', sub: 'He keeps looking over his shoulder…' },
      { kind: 'dropoff', at: { x: -170, z: 108 }, text: 'Bring the accountant to the marina', sub: 'He says men in a black Toro are following' },
    ],
    reward: 500, respect: 1,
    outro: [
      { who: 'The Accountant', line: 'You drive well for a dead man, Cordero. Tell Carmen: the Syndicate wants its harbour fees. Paid in full — or in kind.' },
      { who: 'Rafa', line: '…Tito, your passengers are a health hazard.' },
    ],
  },
  {
    id: 'm3-harbour-fees', title: 'Harbour Fees', giver: 'Doña Carmen',
    start: { x: -178, z: 118 },
    intro: [
      { who: 'Doña Carmen', line: 'The Syndicate thinks my marina is a toll booth. Tonight their collector parks a Toro full of "fees" at Puerto Industrial.' },
      { who: 'Rafa', line: 'You want me to rob the robbers.' },
      { who: 'Doña Carmen', line: 'I want my harbour back. Take their car, lose their friends, and park it in my boathouse. And Rafa — Inspectora Vega has been asking about you.' },
    ],
    steps: [
      { kind: 'goto', at: { x: 196, z: -140 }, text: 'Reach the Puerto Industrial yard', sub: 'The black Toro is by the containers' },
      { kind: 'enterCar', carType: 'muscle', text: 'Steal the Syndicate Toro', sub: 'This will not go unnoticed' },
      { kind: 'escape', text: 'Lose the heat', sub: 'Break line of sight until the stars fade', wanted: 3 },
      { kind: 'deliver', at: { x: -196, z: 140 }, text: 'Park the Toro in the Marisol boathouse', sub: 'West end of the marina' },
    ],
    reward: 800, respect: 2,
    outro: [
      { who: 'Doña Carmen', line: 'Their fees, my harbour. You have a gift, Rafa.' },
      { who: 'Rafa', line: 'Vega has a gift too. She left a note on the windshield: "Welcome home. — V."' },
    ],
  },
  {
    id: 'm4-night-regatta', title: 'Night Regatta', giver: 'Tito Marisol',
    start: { x: -170, z: 108 },
    intro: [
      { who: 'Tito', line: 'Okay, small problem. I bet the charter money on the Night Regatta road race. If our driver wins, we double it. He just… left town.' },
      { who: 'Rafa', line: 'Let me guess. I am the driver.' },
      { who: 'Tito', line: 'Five checkpoints, marina to the lighthouse road and back, before the timer dies. The buggy is gassed up. ¡Vamos!' },
    ],
    steps: [
      { kind: 'enterCar', carType: 'boatcar', text: 'Get into the Charter Buggy', sub: 'By the marina gate' },
      { kind: 'race', text: 'Run the Night Regatta checkpoints', sub: 'Hit every gold ring before the clock runs out', raceId: 'regatta' },
    ],
    reward: 950, respect: 2,
    outro: [
      { who: 'Tito', line: '¡CAMPEÓN! We are rich! Well — less poor. Tía Carmen never needs to know.' },
      { who: 'Rafa', line: 'She already knows, Tito. She always knows.' },
    ],
  },
  {
    id: 'm5-vega', title: 'The Inspectora', giver: 'Inspectora Vega',
    start: { x: 30, z: -30 }, // Plaza Central phone
    intro: [
      { who: 'Inspectora Vega', line: 'Cordero. Six years I kept your file open. The Toro, the cab, the regatta — sloppy. Charming, but sloppy.' },
      { who: 'Rafa', line: 'If this is an arrest, you are doing it very politely.' },
      { who: 'Inspectora Vega', line: 'This is a trade. The Syndicate moves its real money tonight — one Hauler, port to the Colinas vault. Drive it for them. Wear my wire. Or wear my cuffs.' },
      { who: 'Rafa', line: '…Where is the truck?' },
    ],
    steps: [
      { kind: 'goto', at: { x: 210, z: -190 }, text: 'Reach the Syndicate Hauler at the port', sub: 'Far container row' },
      { kind: 'enterCar', carType: 'truck', text: 'Take the Hauler', sub: 'The wire is live. No pressure.' },
      { kind: 'deliver', at: { x: -46, z: -207 }, text: 'Drive the Hauler to the Colinas vault', sub: 'The vault garage fronts the avenue — stop in the ring', wanted: 2 },
      { kind: 'escape', text: 'Shake everyone and vanish', sub: 'Lose all attention to end the night', wanted: 2 },
    ],
    reward: 1400, respect: 3,
    outro: [
      { who: 'Inspectora Vega', line: 'Wire got everything. Names, routes, the vault. You just bought your freedom, Cordero.' },
      { who: 'Rafa', line: 'Then why do I feel like I just sold somebody else\'s?' },
    ],
  },
  {
    id: 'm6-last-tide', title: 'The Last Tide', giver: 'Doña Carmen',
    start: { x: -178, z: 118 },
    intro: [
      { who: 'Doña Carmen', line: 'Vega\'s wire burned the Syndicate — and they know a Marisol boat carried the spark. They are coming for the marina tonight, all of them.' },
      { who: 'Tito', line: 'The charter money, the books, everything is in the office safe. If they take the marina, we are finished.' },
      { who: 'Rafa', line: 'Then we move the safe money first. My Víbora, your fastest route, and every star the ABPD wants to give me. One last tide, Carmen.' },
      { who: 'Doña Carmen', line: 'Bring it home, Rafa. Bring yourself home too.' },
    ],
    steps: [
      { kind: 'goto', at: { x: -178, z: 118 }, text: 'Reach the marina office', sub: 'Load the safe money' },
      { kind: 'enterCar', carType: 'sports', text: 'Take the getaway Víbora', sub: 'Parked at the marina gate, fuelled and waiting' },
      { kind: 'deliver', at: { x: 120, z: -196 }, text: 'Run the money to the Colinas safehouse', sub: 'Every cop in Azahar will want a word', wanted: 4 },
      { kind: 'escape', text: 'Lose the entire ABPD', sub: 'Stay hidden until the stars are gone', wanted: 4 },
      { kind: 'goto', at: { x: 40, z: 258 }, text: 'Watch the sunrise at Azahar Beach', sub: 'You earned it' },
    ],
    reward: 2500, respect: 5,
    outro: [
      { who: 'Doña Carmen', line: 'The marina stands. The Syndicate is a story tourists will not believe. And you, Rafa — you are family. Debt paid, in full.' },
      { who: 'Rafa', line: 'Then I will stay for the summer. Somebody has to drive Tito home from the casino.' },
      { who: 'Narrator', line: 'AZAHAR HEAT — story complete. The city is yours: fares, races and lost tokens still pay, and the ABPD still remembers your face.' },
    ],
  },
];

export function initMissions(sc, missionApi) {
  scene = sc; api = missionApi;
  beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  beacon.visible = false;
  scene.add(beacon);
  beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 26),
    new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.visible = false;
  scene.add(beaconRing);
}

export function missionMarker() {
  if (!current || !markerPos) return null;
  return { x: markerPos.x, z: markerPos.z, color: '#ffd23e' };
}
export function activeMission() { return current; }
export function nextStoryStart() {
  if (S.storyDone || S.freeRoam) return null;
  const def = STORY[S.storyIndex];
  return def ? { x: def.start.x, z: def.start.z, def } : null;
}

export function tryStartMission() {
  const start = nextStoryStart();
  if (!start || current) return false;
  const p = api.getPlayerPos();
  if (dist2d(p.x, p.z, start.x, start.z) > 4.5) return false;
  startMission(start.def);
  return true;
}

function startMission(def) {
  current = { def, stepIdx: -1, data: {} };
  banner(def.title, `A job from ${def.giver}`, 2400);
  playDialogue(def.intro, () => advanceStep());
}

function advanceStep() {
  if (!current) return;
  current.stepIdx++;
  const step = current.def.steps[current.stepIdx];
  if (!step) { finishMission(); return; }
  current.data = {};
  if (step.kind === 'goto' || step.kind === 'deliver' || step.kind === 'pickup' || step.kind === 'dropoff') {
    markerPos = step.at;
  } else if (step.kind === 'enterCar') {
    const car = api.spawnMissionCar(step.carType, current.def);
    current.data.car = car;
    markerPos = car ? { x: car.mesh.position.x, z: car.mesh.position.z } : null;
  } else if (step.kind === 'escape') {
    markerPos = null;
    if (step.wanted) setWanted(Math.max(S.wanted, step.wanted));
  } else if (step.kind === 'race') {
    markerPos = null;
    api.startMissionRace(step.raceId, () => { if (current) advanceStep(); }, () => failMission('The regatta timer ran out.'));
  }
  if (step.wanted && step.kind === 'deliver') setWanted(Math.max(S.wanted, Math.min(step.wanted, S.wanted + 1)));
  setObjective(current.def.title, step.text, step.sub || '');
  if (step.crime) reportCrime(step.crime, true);
}

function finishMission() {
  const def = current.def;
  current = null; markerPos = null;
  S.cash += def.reward; S.respect += def.respect;
  // story gear: Carmen presses a Marlin pistol on Rafa after Harbour Fees, and
  // Vega's quartermaster quietly tops up his ammunition before the finale.
  if (def.id === 'm3-harbour-fees' && !S.hasPistol) {
    S.hasPistol = true; S.weapon = 'pistol'; S.pistolAmmo = 12; S.pistolReserve = 36;
    toast('<b>New weapon: Marlin Pistol.</b> Press 2 to draw it, R to reload.');
  }
  if (def.id === 'm5-vega') { S.pistolReserve += 36; toast('<b>+36 pistol rounds</b> — a gift from the Inspectora.'); }
  S.storyIndex++;
  if (S.storyIndex >= STORY.length) S.storyDone = true;
  sfx.missionDone();
  const p = api.getPlayerPos();
  burst.confetti(p, 30); burst.cash(p, 14);
  playDialogue(def.outro, () => {
    banner('Mission complete', `${def.title} · +$${def.reward}`);
    toast(`<b>+$${def.reward}</b> — ${def.title} complete. Respect +${def.respect}.`);
    healPlayer(25);
    saveGame();
    if (S.storyDone) banner('Story complete', 'AZAHAR HEAT — thanks for playing', 4200);
    setObjective('Free roam', S.storyDone ? 'The city is yours. Fares, races and tokens still pay.' : 'Head to the gold M marker for the next job', '');
  });
  setObjective('', '');
}

export function failMission(why) {
  if (!current) return;
  const def = current.def;
  current = null; markerPos = null;
  banner('Mission failed', why, 2800);
  toast(`<b>${def.title}</b> failed — return to the gold M to retry.`);
  setObjective('Free roam', 'Return to the gold M marker to retry the job', '');
}

export function updateMissions(dt, elapsed) {
  // beacon animation follows the current step target
  const show = !!(current && markerPos && !dialogueActive());
  beacon.visible = show; beaconRing.visible = show;
  if (show) {
    beacon.position.set(markerPos.x, 13, markerPos.z);
    beaconRing.position.set(markerPos.x, 0.15 + Math.sin(elapsed * 3) * 0.05, markerPos.z);
    beacon.material.opacity = 0.22 + Math.sin(elapsed * 2.4) * 0.09;
    const s = 1 + Math.sin(elapsed * 3) * 0.08;
    beaconRing.scale.set(s, s, 1);
  }
  if (!current || dialogueActive()) return;
  const step = current.def.steps[current.stepIdx];
  if (!step) return;
  const p = api.getPlayerPos();
  const car = api.getPlayerCar();
  if (step.kind === 'goto') {
    if (dist2d(p.x, p.z, step.at.x, step.at.z) < 4.2) advanceStep();
  } else if (step.kind === 'deliver' || step.kind === 'dropoff') {
    if (car && dist2d(p.x, p.z, step.at.x, step.at.z) < 6 && Math.abs(car.speed) < 2.5) advanceStep();
    else if (!car && step.kind === 'deliver') setObjective(current.def.title, step.text, 'You need to be in the car');
  } else if (step.kind === 'pickup') {
    if (car && dist2d(p.x, p.z, step.at.x, step.at.z) < 6 && Math.abs(car.speed) < 1.2) {
      sfx.cash();
      toast('<b>Passenger aboard.</b> Drive carefully — tips hate dents.');
      advanceStep();
    }
  } else if (step.kind === 'enterCar') {
    if (current.data.car && car === current.data.car) {
      if (step.crime) reportCrime(step.crime, true);
      advanceStep();
    } else if (current.data.car) {
      markerPos = { x: current.data.car.mesh.position.x, z: current.data.car.mesh.position.z };
    }
  } else if (step.kind === 'escape') {
    if (S.wanted === 0) { clearWanted(); advanceStep(); }
    else setObjective(current.def.title, step.text, `${S.wanted} star${S.wanted > 1 ? 's' : ''} — break line of sight`);
  }
}

export function missionPrompt() {
  if (current || S.freeRoam || S.storyDone) return null;
  const start = nextStoryStart();
  if (!start) return null;
  const p = api.getPlayerPos();
  if (dist2d(p.x, p.z, start.x, start.z) < 4.5) {
    return `<b>E</b> — Start "${start.def.title}" (${start.def.giver})`;
  }
  return null;
}
export function storyProgressText() {
  return S.storyDone ? 'Story complete' : `Story ${Math.min(S.storyIndex + (current ? 1 : 0), 6)}/6`;
}
export { clamp as _clampRef };
