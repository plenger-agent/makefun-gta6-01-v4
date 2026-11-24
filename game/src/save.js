// save.js — localStorage persistence for Azahar Heat. One job: snapshot the durable
// parts of the shared state (cash, story progress, collectibles, clock) and restore
// them on boot. Volatile things (positions, wanted level) are deliberately not saved:
// every load starts the player clean on Plaza Central.

import { S, SAVE_KEY } from './config.js';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame() {
  try {
    const data = {
      v: 4,
      cash: S.cash, respect: S.respect, day: S.day, timeMin: S.timeMin,
      storyIndex: S.storyIndex, storyDone: S.storyDone,
      tokensFound: S.tokensFound, taxiFaresDone: S.taxiFaresDone,
      racesWon: S.racesWon, carsStolen: S.carsStolen,
      hasPistol: S.hasPistol, armor: S.armor,
      tokenIds: [...(S._tokenIds || [])],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 4) return false;
    S.cash = d.cash | 0; S.respect = d.respect | 0;
    S.day = Math.max(1, d.day | 0); S.timeMin = d.timeMin || 480;
    S.storyIndex = d.storyIndex | 0; S.storyDone = !!d.storyDone;
    S.tokensFound = d.tokensFound | 0; S.taxiFaresDone = d.taxiFaresDone | 0;
    S.racesWon = d.racesWon | 0; S.carsStolen = d.carsStolen | 0;
    S.hasPistol = !!d.hasPistol; S.armor = d.armor | 0;
    S._tokenIds = new Set(d.tokenIds || []);
    S.health = 100; S.wanted = 0; S.heat = 0;
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

// Cheap progress fingerprint for the pause screen: missions done + finds.
export function progressPercent() {
  const story = (S.storyDone ? 6 : S.storyIndex) / 6;
  const tokens = S.tokensFound / 20;
  return Math.round((story * 0.75 + tokens * 0.25) * 100);
}

export function saveSummary() {
  if (!hasSave()) return '';
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    return `Saved game: $${d.cash} · story ${Math.min(d.storyIndex, 6)}/6 · day ${d.day}`;
  } catch { return ''; }
}
