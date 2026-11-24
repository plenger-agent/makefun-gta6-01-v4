// shots.js — scripted screenshot poses for Azahar Heat. One job: when the page is
// opened with ?shot=cover|drive|chase|mission, stage a real, playable scene that
// shows off the game's systems (city vista / driving in traffic / a police chase
// with the full HUD / a story mission opening), then flag window.__shotReady so a
// headless browser can capture a genuine render. No fake overlays: everything in
// frame is the live game, simulated for a few seconds before the capture.

import { S, clamp } from './config.js';
import { setObjective } from './hud.js';

export function parseShotMode() {
  const q = new URLSearchParams(location.search);
  const s = q.get('shot');
  return ['cover', 'drive', 'chase', 'mission'].includes(s) ? s : null;
}

// ctx: everything main.js owns that a pose needs.
export function applyShot(name, ctx) {
  const { player, enterCar, spawnCopNear, startFirstMission, setTime, faceCamera } = ctx;
  S.freeRoam = name !== 'mission';
  if (name === 'cover') {
    setTime(16.8 * 60); // late golden afternoon: warm but fully lit
    player.pos.set(30, 0, 44);
    player.heading = -2.6; // looking across the plaza toward downtown + the bay glint
    faceCamera(player.heading + Math.PI + 0.7, 0.42);
    // dress the frame: the hero Toro waits at the kerb, a cab idles across the road
    const toro = ctx.findCarNear(player.pos, 'muscle');
    if (toro) { toro.mesh.position.set(24, 0, 37); toro.heading = Math.PI / 2; toro.mesh.rotation.y = Math.PI / 2; }
    setObjective('Azahar Heat', 'One city. Every debt comes due at sunset.', 'Explore on foot or steal a ride');
  } else if (name === 'drive') {
    setTime(10.4 * 60);
    const car = ctx.findCarNear({ x: 8, z: 40 }, 'muscle') || ctx.anyFreeCar();
    if (car) {
      enterCar(car, true);
      car.mesh.position.set(-2, 0, -60);
      car.heading = 0; car.speed = 16;
      car.mesh.rotation.y = 0;
      player.heading = 0;
    }
    setObjective('Free roam', 'Cruise Avenida del Faro', 'Traffic, fares and trouble included');
  } else if (name === 'chase') {
    setTime(17.4 * 60); // sunset chase: low orange light, stars already out
    const car = ctx.findCarNear({ x: 8, z: 40 }, 'muscle') || ctx.anyFreeCar();
    if (car) {
      enterCar(car, true);
      car.mesh.position.set(2, 0, -30);
      car.heading = 0; car.speed = 12;
      car.mesh.rotation.y = 0;
    }
    S.wanted = 3; S.heat = 3.4;
    // two pursuers close behind (in the minimap's flash ring) and one blocker
    // angled across the road ahead, headlights on, inside the camera frame
    spawnCopNear(-3, -44); spawnCopNear(7, -47);
    const blocker = spawnCopNear(0, -4);
    if (blocker) { blocker.heading = Math.PI * 0.92; blocker.mesh.rotation.y = blocker.heading; blocker.ai.role = 'blocker'; }
    setObjective('Harbour Fees', 'Lose the heat, then park the Toro in the boathouse', '3 stars — break line of sight');
  } else if (name === 'mission') {
    setTime(9.2 * 60);
    player.pos.set(-177, 0, 121);
    player.heading = 1.77;
    faceCamera(-1.37, 0.3);
    startFirstMission();
    // the office doorstep is tight against the facade; step back into the coast
    // road for the capture so the frame holds the marina street, palms and signs
    player.pos.set(-187, 0, 128);
    player.heading = -2.36;
    faceCamera(0.785, 0.34);
  }
  // a few frames of simulation happen in main before __shotReady is set
  return true;
}

export function shotTimeScale() { return 1; }
export { clamp as _cl };
