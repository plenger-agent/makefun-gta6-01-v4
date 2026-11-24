// main.js — Azahar Heat entry point and conductor. One job: build the world and every
// system, run the frame loop, route interactions (enter cars, start jobs, talk), apply
// the cross-system rules nobody else owns (car↔pedestrian collisions, crash injuries,
// clock, district names, radio, autosave), and drive the menu/pause/game-over screens.

import * as THREE from 'three';
import { S, clamp, dist2d, districtAt, RADIO_LINES, pick } from './config.js';
import { initInput, keys, mouse, pressed, endFrameInput } from './input.js';
import { initAudio, setMuted, setEngine, sfx } from './audio.js';
import { hasSave, loadGame, saveGame, clearSave, saveSummary } from './save.js';
import { initEffects, updateEffects, burst, addShake } from './effects.js';
import { buildWorld, updateWorld } from './world.js';
import { initVehicles, spawnCar, removeCar, cars, driveCar, nearestCarTo, carSpeedKmh } from './vehicles.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { initPeds, updatePeds, peds, scarePeds, hurtPed } from './pedestrians.js';
import { initPlayer, player, updatePlayer, placePlayerAtCarDoor } from './player.js';
import { initPolice, updatePolice, copCars, clearPolice } from './police.js';
import { initWanted, reportCrime, updateWanted, clearWanted, isHiding } from './wanted.js';
import { initCombat, updateCombat, hurtPlayer, reloadPistol } from './combat.js';
import { initMissions, updateMissions, tryStartMission, missionPrompt, missionMarker, nextStoryStart, STORY } from './missions.js';
import { initActivities, updateActivities, activityMarkers, nearActivityStart, runActivityStart, activityActive } from './activities.js';
import { initHud, showHud, renderHud, setObjective, setPrompt, toast, banner, dialogueActive, advanceDialogue, updateDialogue } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';
import { initCamera, updateCamera, cam, snapCameraBehind } from './camera.js';
import { parseShotMode, applyShot } from './shots.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const MISSION_CAR_SPOTS = {
  'm1-homecoming': { x: 64, z: 240, heading: Math.PI / 2 },
  'm2-fare-warning': { x: -166, z: 100, heading: 0 },
  'm3-harbour-fees': { x: 200, z: -140, heading: Math.PI },
  'm4-night-regatta': { x: -164, z: 100, heading: 0 },
  'm5-vega': { x: 212, z: -188, heading: -Math.PI / 2 },
  'm6-last-tide': { x: -172, z: 110, heading: Math.PI / 2 },
};

let elapsed = 0, radioCd = 14, autosaveCd = 30, frame = 0;
let endKind = null;

function playerPos() { return S.inCar ? S.inCar.mesh.position : player.pos; }
function playerVel() {
  if (S.inCar) { const c = S.inCar; return { x: Math.sin(c.heading) * c.speed, z: Math.cos(c.heading) * c.speed }; }
  return { x: Math.sin(player.heading) * player.speed, z: Math.cos(player.heading) * player.speed };
}

// ---------- car entry / exit ----------
function enterCar(car, silent = false) {
  if (!car || car.dead || car.driver === 'police') return false;
  const wasParked = !car.driver;
  const wasTraffic = car.driver === 'traffic';
  car.driver = 'player';
  S.inCar = car;
  player.mesh.visible = false;
  if (!silent) {
    sfx.door();
    if (wasTraffic && !car.everPlayer) {
      // dragging a driver out of a moving cab is very much a witnessed crime
      reportCrime('carTheftWitnessed', true);
      S.carsStolen++;
      toast(`<b>${car.spec.name}</b> taken — the driver is already dialling the ABPD.`);
    } else if (wasParked && !car.missionCar && !car.everPlayer) {
      const witnessed = peds.some((pd) => dist2d(pd.mesh.position.x, pd.mesh.position.z, car.mesh.position.x, car.mesh.position.z) < 22) || copCars.length > 0;
      reportCrime(witnessed ? 'carTheftWitnessed' : 'carTheft', witnessed);
      S.carsStolen++;
      toast(`<b>${car.spec.name}</b> acquired. ${witnessed ? 'Someone saw that…' : ''}`);
    } else if (!car.everPlayer) {
      toast(`<b>${car.spec.name}</b> — ${car.spec.topSpeed * 3.6 | 0} km/h top speed`);
    }
  }
  car.everPlayer = true;
  snapCameraBehind(camera, { pos: car.mesh.position, heading: car.heading });
  return true;
}
function exitCar() {
  const car = S.inCar;
  if (!car) return;
  S.inCar = null;
  car.driver = null;
  if (Math.abs(car.speed) < 3) car.speed = 0;
  placePlayerAtCarDoor(car);
  player.mesh.visible = true;
  sfx.door();
  setEngine(false, 0, 0);
}

// ---------- end states ----------
function showEnd(kind, why) {
  if (S.mode === 'over') return;
  S.mode = 'over'; endKind = kind;
  document.getElementById('end-title').textContent = kind === 'busted' ? 'Busted' : 'Wasted';
  document.getElementById('end-why').textContent = why;
  document.getElementById('end-screen').classList.remove('hidden');
  if (kind === 'busted') sfx.busted();
  setEngine(false, 0, 0);
}
function respawn() {
  document.getElementById('end-screen').classList.add('hidden');
  const penalty = endKind === 'busted' ? Math.min(S.cash, 200) : Math.min(S.cash, 120);
  S.cash -= penalty;
  if (S.inCar) { removeCar(S.inCar); S.inCar = null; }
  clearPolice(); clearWanted();
  S.health = 100; S.bust = 0;
  if (endKind === 'busted') player.pos.set(38, 0, -38);       // outside ABPD HQ, Plaza
  else player.pos.set(52, 0, -52);                            // Clínica Costa steps
  player.heading = Math.PI;
  S.mode = 'play';
  toast(endKind === 'busted' ? `<b>Released.</b> The ABPD kept $${penalty} as a "processing fee". Your car was impounded.`
    : `<b>Clínica Costa</b> patched you up for $${penalty}.`);
  saveGame();
}

// ---------- boot ----------
function boot() {
  initInput(canvas);
  buildWorld(scene);
  initEffects(scene);
  initVehicles(scene);
  initPlayer(scene);
  initCamera(camera);
  initHud();
  initMinimap();
  initWanted((n) => { if (n > 0 && S.mode === 'play') toast(`<b>Wanted level ${n}</b> — the ABPD is rolling.`); });
  const pedEvents = (kind, ped, cause) => { void kind; void ped; void cause; };
  initPeds(scene, () => playerPos(), pedEvents);
  initTraffic(() => playerPos());
  initPolice(() => {
    const p = playerPos(), v = playerVel();
    return { pos: p, vel: v, car: S.inCar, speed: S.inCar ? Math.abs(S.inCar.speed) : player.speed };
  }, () => showEnd('busted', 'The Azahar Bay PD finally boxed you in.'));
  initCombat(scene, (cause) => showEnd('wasted', cause === 'ram' ? 'A grille won that argument.' : 'Azahar Bay is a beautiful place to bleed. The clinic disagrees about the view.'));
  const missionApi = {
    getPlayerPos: () => playerPos(),
    getPlayerCar: () => S.inCar,
    spawnMissionCar: (carType, def) => {
      const spot = MISSION_CAR_SPOTS[def.id] || { x: player.pos.x + 6, z: player.pos.z + 6, heading: 0 };
      const car = spawnCar(carType, spot.x, spot.z, spot.heading, {});
      car.missionCar = true;
      return car;
    },
    startMissionRace: (raceId, onDone, onFail) => {
      import('./activities.js').then((m) => m.startMissionRace(raceId, onDone, onFail));
    },
  };
  initMissions(scene, missionApi);
  initActivities(scene, { getPlayerPos: () => playerPos(), getPlayerCar: () => S.inCar });

  // screens
  const startScreen = document.getElementById('start-screen');
  const continueBtn = document.getElementById('btn-continue');
  if (hasSave()) { continueBtn.style.display = ''; document.getElementById('save-note').textContent = saveSummary(); }
  const begin = (mode) => {
    initAudio();
    startScreen.classList.add('hidden');
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('fade').style.opacity = '0';
    showHud(true);
    S.mode = 'play';
    if (mode === 'free') { S.freeRoam = true; setObjective('Free roam', 'Azahar Bay is yours — fares, races, tokens, trouble', ''); }
    else if (mode === 'continue') { setObjective('Story', 'Head to the gold M marker for the next job', ''); toast('<b>Welcome back</b> to Azahar Bay.'); }
    else setObjective(STORY[0].title, 'Meet Doña Carmen at Marina del Sol — follow the gold M', '');
    snapCameraBehind(camera, { pos: player.pos, heading: player.heading });
  };
  document.getElementById('btn-start').addEventListener('click', () => { clearSave(); begin('story'); });
  continueBtn.addEventListener('click', () => { loadGame(); begin('continue'); });
  document.getElementById('btn-free').addEventListener('click', () => begin('free'));
  document.getElementById('btn-help').addEventListener('click', () => toggleHelp(true));
  document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
  document.getElementById('btn-pause-help').addEventListener('click', () => toggleHelp(true));
  document.getElementById('btn-help-back').addEventListener('click', () => toggleHelp(false));
  document.getElementById('btn-restart').addEventListener('click', () => { clearSave(); location.reload(); });
  document.getElementById('btn-again').addEventListener('click', respawn);
  canvas.addEventListener('pointerdown', () => initAudio(), { once: true });

  // screenshot mode: skip the menu entirely and stage a scene
  const shot = parseShotMode();
  if (shot) {
    S.shotMode = shot;
    loadGame(); // harmless if absent; shot poses set their own state after
    S.cash = 2450; S.storyIndex = 0; S.storyDone = false;
    begin(shot === 'mission' ? 'story' : 'free');
    applyShot(shot, {
      player,
      enterCar: (c, s) => enterCar(c, s),
      findCarNear: (pos, type) => cars.find((c) => c.type === type && !c.driver) || null,
      anyFreeCar: () => cars.find((c) => !c.driver) || null,
      spawnCopNear: (x, z) => { const c = spawnCar('police', x, z, 0, { driver: 'police' }); copCars.push(c); c.ai = { role: 'chaser', ramCd: 0 }; return c; },
      startFirstMission: () => { player.pos.set(STORY[0].start.x + 1, 0, STORY[0].start.z + 3); tryStartMission(); },
      setTime: (m) => { S.timeMin = m; },
      faceCamera: (yaw, pitch) => { cam.yaw = yaw; cam.pitch = pitch; },
    });
    setTimeout(() => { window.__shotReady = true; }, 2600);
  } else {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('fade').style.opacity = '0';
    S.mode = 'menu';
  }
  requestAnimationFrame(loop);
}

function togglePause(on) {
  if (S.mode !== 'play' && on) return;
  S.paused = on;
  document.getElementById('pause-screen').classList.toggle('hidden', !on);
  if (on) {
    document.getElementById('pause-stats').textContent =
      `Cash $${S.cash} · Story ${S.storyDone ? 'complete' : `${S.storyIndex}/6`} · Day ${S.day} · Tokens ${S.tokensFound}/20 · Fares ${S.taxiFaresDone} · Races won ${S.racesWon}`;
  }
}
function toggleHelp(on) {
  document.getElementById('help-screen').classList.toggle('hidden', !on);
  if (on) S.paused = true;
  else if (S.mode === 'play' && document.getElementById('pause-screen').classList.contains('hidden')) S.paused = false;
}

// ---------- per-frame ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  // pause/help keys are handled before the clock is frozen, so they also work
  // while the game is paused (the sim block below never runs at dt = 0).
  if (S.mode === 'play') {
    if (pressed('Escape') || pressed('KeyP')) togglePause(!S.paused);
    if (pressed('KeyH')) toggleHelp(document.getElementById('help-screen').classList.contains('hidden'));
  }
  if (S.paused || S.mode === 'menu' || S.mode === 'over') dt = 0;
  elapsed += dt;
  frame++;

  if (dt > 0) {
    // clock + district
    S.timeMin += dt * 1.5;
    if (S.timeMin >= 1440) { S.timeMin -= 1440; S.day++; toast(`<b>Day ${S.day}</b> in Azahar Bay.`); saveGame(); }
    const pp = playerPos();
    S.district = districtAt(pp.x, pp.z);

    // player / driving
    let camYaw = cam.yaw;
    if (S.inCar) {
      const car = S.inCar;
      let fwd = 0, side = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) side -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) side += 1;
      const crashed = driveCar(car, { throttle: fwd, steer: -side, handbrake: keys.has('Space') }, dt, (impact) => {
        if (impact > 9) reportCrime(impact > 16 ? 'hitCarHard' : 'hitCar', true);
        if (impact > 15) hurtPlayer((impact - 12) * 0.8, 'crash');
      });
      void crashed;
      S.speedKmh = carSpeedKmh(car);
      player.pos.copy(car.mesh.position);
      setEngine(true, Math.abs(car.speed) / car.spec.topSpeed, fwd > 0 ? 0.5 : 0);
      // radio flavour
      radioCd -= dt;
      if (radioCd <= 0) { radioCd = 26 + Math.random() * 20; toast(`📻 ${pick(RADIO_LINES)}`, 5200); }
    } else {
      updatePlayer(dt, camYaw);
      S.speedKmh = player.speed * 3.6;
      setEngine(false, 0, 0);
      // while attacking, ease the character to face where the camera looks
      if (mouse.down) {
        const want = cam.yaw + Math.PI;
        let dh = (want - player.heading) % (Math.PI * 2);
        if (dh > Math.PI) dh -= Math.PI * 2;
        if (dh < -Math.PI) dh += Math.PI * 2;
        player.heading += dh * Math.min(1, dt * 10);
      }
    }

    // car ↔ pedestrian collisions (player car and police do the damage)
    for (const car of cars) {
      if (car.dead || Math.abs(car.speed) < 3.5) continue;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        const d = dist2d(car.mesh.position.x, car.mesh.position.z, ped.mesh.position.x, ped.mesh.position.z);
        if (d < 1.7) {
          hurtPed(ped, Math.abs(car.speed) * 4.2, 'car', car.mesh.position);
          burst.sparks(ped.mesh.position, 5);
          if (car.driver === 'player') {
            reportCrime(ped.health <= 0 ? 'killPed' : 'hitPed', true);
            hurtPlayer(2, 'jolt');
            addShake(0.3);
          }
          car.speed *= 0.82;
        }
      }
    }

    updateTraffic(dt);
    // threats that make peds flee: fast cars + drawn pistol
    const threats = [];
    for (const car of cars) if (!car.dead && Math.abs(car.speed) > 9) threats.push({ x: car.mesh.position.x, z: car.mesh.position.z, radius: 9 });
    if (!S.inCar && S.weapon === 'pistol' && S.hasPistol) threats.push({ x: player.pos.x, z: player.pos.z, radius: 8 });
    updatePeds(dt, threats);
    updatePolice(dt, elapsed);
    updateWanted(dt);
    updateCombat(dt, mouse.down || mouse.downEdge, cam.yaw + Math.PI);
    updateMissions(dt, elapsed);
    updateActivities(dt, elapsed);
    updateDialogue(dt);

    // interactions
    handleInteractions();
    // keys: weapons / reload / mute (pause + help live above the dt gate)
    if (pressed('Digit1')) S.weapon = 'fists';
    if (pressed('Digit2') && S.hasPistol) S.weapon = 'pistol';
    if (pressed('KeyR')) reloadPistol();
    if (pressed('KeyM')) { initAudio(); setMuted(!S.muted); toast(S.muted ? '<b>Sound muted</b>' : '<b>Sound on</b>'); }

    autosaveCd -= dt;
    if (autosaveCd <= 0) { autosaveCd = 30; saveGame(); }
  }

  // visuals that should track even at dt=0 (menus still render the city)
  const focus = playerPos();
  updateWorld(Math.max(dt, 0.001), S.timeMin, focus, elapsed);
  updateEffects(Math.max(dt, 0.001));
  const camTarget = S.inCar
    ? { pos: S.inCar.mesh.position, heading: S.inCar.heading, speed: S.inCar.speed, inCar: true, vel: playerVel() }
    : { pos: player.pos, heading: player.heading, speed: player.speed, inCar: false, vel: playerVel() };
  if (S.mode !== 'menu') updateCamera(Math.max(dt, 0.016), camera, camTarget);
  else { // slow menu orbit over the plaza
    cam.yaw += 0.0006;
    camera.position.set(player.pos.x + Math.sin(cam.yaw) * 26, 13, player.pos.z + Math.cos(cam.yaw) * 26);
    camera.lookAt(player.pos.x, 2, player.pos.z);
  }
  if (S.mode === 'play' || S.shotMode) {
    renderHud({ hiding: isHiding(), speedKmh: S.speedKmh });
    const markers = [];
    const mm = missionMarker(); if (mm) markers.push(mm);
    const ns = nextStoryStart(); if (ns && !missionMarker()) markers.push({ x: ns.x, z: ns.z, color: '#ffb347' });
    for (const am of activityMarkers()) markers.push(am);
    if (frame % 2 === 0) drawMinimap({ playerPos: focus, heading: cam.yaw + Math.PI, cars, copCars, peds, markers });
  }
  renderer.render(scene, camera);
  endFrameInput();
}

function handleInteractions() {
  if (S.mode !== 'play') return;
  // dialogue advance takes the key first
  if (dialogueActive()) {
    setPrompt('<b>E</b> — Continue');
    if (pressed('KeyE') || pressed('KeyF')) advanceDialogue();
    return;
  }
  if (S.inCar) {
    setPrompt('<b>F</b> — Exit vehicle');
    if (pressed('KeyF') || pressed('KeyE')) exitCar();
    return;
  }
  // mission start?
  const mp = missionPrompt();
  if (mp) {
    setPrompt(mp);
    if (pressed('KeyE')) { initAudio(); tryStartMission(); }
    return;
  }
  // enter nearest car
  const near = nearestCarTo(player.pos, 3.4);
  if (near && near.driver !== 'police') {
    const act = nearActivityStart();
    if (act && dist2d(player.pos.x, player.pos.z, near.mesh.position.x, near.mesh.position.z) > 2.2) {
      setPrompt(act.label);
      if (pressed('KeyE')) { runActivityStart(act.kind); return; }
    }
    setPrompt(`<b>E</b> — Drive the ${near.spec.name}${near.driver === 'traffic' ? ' (occupied!)' : ''}`);
    if (pressed('KeyE') || pressed('KeyF')) { initAudio(); enterCar(near); }
    return;
  }
  const act = nearActivityStart();
  if (act) {
    setPrompt(act.label);
    if (pressed('KeyE')) { initAudio(); runActivityStart(act.kind); }
    return;
  }
  setPrompt('');
}

boot();
