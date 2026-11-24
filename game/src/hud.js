// hud.js — every DOM element of the interface. One job: render game state into the
// HUD (stars, cash, bars, clock, speedometer, weapon), and own the transient text
// channels — toasts, centre banners, the dialogue box with its typewriter queue, the
// objective card and the interaction prompt. No game logic: modules push, hud draws.

import { S, clamp } from './config.js';
import { sfx } from './audio.js';

const el = {};
let bannerTimer = null;
let lastCash = null;
let dlgQueue = [], dlgActive = null, dlgCharT = 0, onDialogueDone = null;

export function initHud() {
  for (const id of ['hud', 'wanted', 'cash', 'clock-line', 'health-fill', 'armor-fill', 'bust-fill', 'bust-wrap',
    'objective', 'obj-kicker', 'obj-text', 'obj-sub', 'prompt', 'speedo', 'speed-num', 'car-name',
    'weapon', 'weapon-name', 'weapon-ammo', 'dialogue', 'dlg-who', 'dlg-line', 'banner', 'banner-big',
    'banner-small', 'toasts', 'minimap-label']) {
    el[id] = document.getElementById(id);
  }
}

export function showHud(on) { el.hud.classList.toggle('hidden', !on); }

const STAR_ON = '★', STAR_OFF = '★';
export function renderHud(state) {
  // wanted stars (blink while hiding)
  let stars = '';
  const blink = state.hiding && (Math.floor(performance.now() / 380) % 2 === 0);
  for (let i = 0; i < 5; i++) {
    const on = i < S.wanted;
    stars += `<span class="star ${on ? 'on' : ''}" style="${on && blink ? 'opacity:.25' : ''}">${on ? STAR_ON : STAR_OFF}</span>`;
  }
  el.wanted.innerHTML = stars;
  el.cash.innerHTML = `$${S.cash.toLocaleString('en-US')} <small>CASH</small>`;
  if (lastCash !== null && S.cash !== lastCash) {
    el.cash.style.transform = 'scale(1.12)';
    el.cash.style.color = S.cash > lastCash ? '#a4ffb0' : '#ff9a9a';
    setTimeout(() => { el.cash.style.transform = ''; el.cash.style.color = ''; }, 180);
  }
  lastCash = S.cash;
  const hh = String(Math.floor(S.timeMin / 60) % 24).padStart(2, '0');
  const mm = String(Math.floor(S.timeMin % 60)).padStart(2, '0');
  el['clock-line'].textContent = `Day ${S.day} · ${hh}:${mm} · ${S.district}`;
  el['health-fill'].style.width = `${clamp(S.health, 0, 100)}%`;
  el['armor-fill'].style.width = `${clamp(S.armor, 0, 100)}%`;
  el['bust-wrap'].classList.toggle('show', S.bust > 0.02);
  el['bust-fill'].style.width = `${clamp(S.bust * 100, 0, 100)}%`;
  if (S.inCar) {
    el.speedo.classList.add('show');
    el['speed-num'].textContent = String(Math.round(state.speedKmh || 0));
    el['car-name'].textContent = S.inCar.spec.name + (S.inCar.health < 35 ? ' · wrecked' : S.inCar.health < 70 ? ' · damaged' : '');
    el.weapon.classList.remove('show');
  } else {
    el.speedo.classList.remove('show');
    el.weapon.classList.add('show');
    el['weapon-name'].textContent = S.weapon === 'pistol' && S.hasPistol ? 'Marlin Pistol' : 'Fists';
    el['weapon-ammo'].textContent = S.weapon === 'pistol' && S.hasPistol ? `${S.pistolAmmo} / ${S.pistolReserve}` : '';
  }
  el['minimap-label'].textContent = S.district;
}

export function setObjective(kicker, text, sub = '') {
  if (!text) { el.objective.classList.add('hidden'); return; }
  el.objective.classList.remove('hidden');
  el['obj-kicker'].textContent = kicker || 'Objective';
  el['obj-text'].textContent = text;
  el['obj-sub'].textContent = sub || '';
}

export function setPrompt(html) {
  if (!html) { el.prompt.classList.remove('show'); el.prompt.innerHTML = ''; return; }
  el.prompt.innerHTML = html;
  el.prompt.classList.add('show');
}

export function toast(html, ms = 4200) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = html;
  el.toasts.appendChild(t);
  while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 420); }, ms);
}

export function banner(big, small = '', ms = 2600) {
  el['banner-big'].textContent = big;
  el['banner-small'].textContent = small;
  el.banner.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), ms);
}

// ---- dialogue: a queue of {who, line}; E advances; callback when the queue empties ----
export function playDialogue(lines, doneFn) {
  dlgQueue = [...lines];
  onDialogueDone = doneFn || null;
  nextDialogueLine();
}
function nextDialogueLine() {
  dlgActive = dlgQueue.shift() || null;
  if (!dlgActive) {
    el.dialogue.classList.remove('show');
    const f = onDialogueDone; onDialogueDone = null;
    if (f) f();
    return;
  }
  el['dlg-who'].textContent = dlgActive.who;
  el['dlg-line'].textContent = '';
  dlgCharT = 0;
  el.dialogue.classList.add('show');
  sfx.phone();
}
export function dialogueActive() { return !!dlgActive; }
export function advanceDialogue() { if (dlgActive) nextDialogueLine(); }
export function updateDialogue(dt) {
  if (!dlgActive) return;
  // screenshot poses type instantly so captures never catch a half-typed line
  dlgCharT += dt * 55 * (S.shotMode ? 10 : 1);
  const n = Math.min(dlgActive.line.length, Math.floor(dlgCharT));
  el['dlg-line'].textContent = dlgActive.line.slice(0, n);
}
export function skipDialogue() { dlgQueue = []; if (dlgActive) nextDialogueLine(); }
