// config.js — Azahar Heat: world constants, seeded random, shared game state, and the
// big data tables (vehicle catalogue, districts, shop names, radio chatter, ped names).
// One job: be the single source of truth every other module reads from.

// ---------- deterministic random (mulberry32) ----------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = makeRng(20261124);
export const rand = (a, b) => a + rng() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- city layout ----------
// Roads run on a square grid. ROAD_LINES are the centre lines; the blocks between
// them hold buildings. The bay (sand + ocean) fills the south edge, z > BAY_Z.
export const ROAD_LINES = [-230, -184, -138, -92, -46, 0, 46, 92, 138, 184, 230];
export const ROAD_HALF = 7;          // half width of asphalt
export const SIDEWALK = 3.2;         // sidewalk band beyond the asphalt
export const CITY_MIN = -252, CITY_MAX = 252;
export const BAY_Z = 252;            // sand starts here, water beyond z = 286
export const WATER_Z = 288;

// District lookup by position: name shown on the HUD and used for building styles.
export function districtAt(x, z) {
  if (z > BAY_Z) return 'Azahar Beach';
  if (x < -150 && z > 60) return 'Marina del Sol';
  if (x > 150 && z < -60) return 'Puerto Industrial';
  if (Math.abs(x) < 100 && z < -40) return 'Downtown Azahar';
  if (z < -150) return 'Colinas Heights';
  if (x > 120) return 'Barrio Palmas';
  if (x < -120) return 'Viejo Puerto';
  return 'Centro';
}
export const DISTRICT_BLURBS = {
  'Downtown Azahar': 'Glass towers, hotter sidewalks.',
  'Azahar Beach': 'Salt air and bad decisions.',
  'Marina del Sol': 'Yachts, charters and quiet money.',
  'Puerto Industrial': 'Cranes, containers and night shifts.',
  'Colinas Heights': 'Rich houses, richer secrets.',
  'Barrio Palmas': 'Murals, markets and the best empanadas in the bay.',
  'Viejo Puerto': 'The old port never really sleeps.',
  'Centro': 'The middle of everything.',
};

// ---------- vehicle catalogue ----------
// topSpeed in m/s, accel m/s^2, grip = steering authority, value = chop-shop price.
export const VEHICLE_TYPES = {
  sedan:   { name: 'Corvina Sedan',    topSpeed: 33, accel: 11, grip: 2.2, mass: 1.0, value: 400,  colors: [0xb8bcc4, 0x3a4a6b, 0x6b3a3a, 0x2e4a3a, 0xd8d3c3] },
  compact: { name: 'Pico Hatch',       topSpeed: 28, accel: 12, grip: 2.5, mass: 0.8, value: 250,  colors: [0xe0a030, 0x50a0c8, 0xc8507a, 0x70b060, 0xe8e8e8] },
  taxi:    { name: 'Radio Cab',        topSpeed: 31, accel: 11, grip: 2.3, mass: 1.0, value: 300,  colors: [0xf2b821] },
  sports:  { name: 'Víbora GT',        topSpeed: 47, accel: 19, grip: 2.9, mass: 0.9, value: 1500, colors: [0xd8232a, 0x14161c, 0xf0f0f0, 0x7a1fd0, 0x0f7a5c] },
  muscle:  { name: 'Toro Muscle',      topSpeed: 42, accel: 17, grip: 2.0, mass: 1.2, value: 1100, colors: [0x23232a, 0x8c1f28, 0x1f4d8c, 0xc76b15] },
  van:     { name: 'Burro Van',        topSpeed: 26, accel: 9,  grip: 1.8, mass: 1.5, value: 500,  colors: [0xd8d8d8, 0x707880, 0x3a5a78, 0x8a6d3b] },
  truck:   { name: 'Hauler Pickup',    topSpeed: 30, accel: 10, grip: 1.9, mass: 1.4, value: 650,  colors: [0x5a4632, 0x33424f, 0x74553a, 0x9aa0a4] },
  police:  { name: 'ABPD Interceptor', topSpeed: 44, accel: 18, grip: 2.8, mass: 1.1, value: 0,    colors: [0xf2f2f2] },
  boatcar: { name: 'Charter Buggy',    topSpeed: 25, accel: 10, grip: 2.4, mass: 0.7, value: 350,  colors: [0x20b2aa, 0xff7f50, 0xffd23e] },
};
export const PARKED_TYPES = ['sedan', 'compact', 'taxi', 'sports', 'muscle', 'van', 'truck', 'boatcar'];
export const TRAFFIC_TYPES = ['sedan', 'compact', 'taxi', 'van', 'truck', 'muscle'];

// ---------- people ----------
export const PED_FIRST = ['Lucía', 'Mateo', 'Sofía', 'Diego', 'Carmen', 'Rafael', 'Isabela', 'Hugo',
  'Valentina', 'Andrés', 'Marina', 'Tomás', 'Elena', 'Bruno', 'Paloma', 'Óscar', 'Nuria', 'Javier',
  'Alba', 'Rubén', 'Celia', 'Marcos', 'Iris', 'Dario', 'Lola', 'Emilio', 'Rosa', 'Félix', 'Amara', 'Nico'];
export const PED_LAST = ['Marisol', 'Ferrer', 'Costa', 'Navarro', 'Iglesias', 'Serrano', 'Vidal', 'Roca',
  'Molina', 'Herrera', 'Campos', 'Luna', 'Ortiz', 'Salas', 'Pardo', 'Quintana', 'Beltrán', 'Arias'];
export const PED_SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22,
  0xecf0f1, 0xfd79a8, 0x00cec9, 0xfdcb6e, 0x6c5ce7, 0x00b894, 0xd63031, 0x74b9ff, 0xa29bfe];

// ---------- city flavour: shop & building signage ----------
export const SHOP_NAMES = ['Café Brisa', 'Taller Roca', 'Farmacia Luna', 'Hotel Miramar', 'Banco del Sol',
  'Pescadería Azul', 'Tacos El Faro', 'Joyas Quintana', 'Cine Azahar', 'Mercado Central', 'Bar La Ola',
  'Helados Núñez', 'Librería Coral', 'Gym Titanes', 'Floristería Alba', 'Puerto Nights', 'Sushi Bahía',
  'Vinos Serrano', 'Radio Azahar FM', 'Seguros Vidal', 'Dental Costa', 'Moda Palmera', 'Cyber Bahía',
  'Panadería Sol', 'Charter Marisol', 'Autos Ferrer', 'Club Náutico', 'Tatuajes Iris', 'Óptica Mar',
  'Ferretería Puerto', 'Lavandería Brisa', 'Restaurante Faro', 'Discoteca Coral', 'Inmobiliaria Roca'];
export const TOWER_NAMES = ['Torre Azahar', 'Edificio Miramar', 'Torre Coral', 'Banco Central Azahar',
  'Hotel Emperador', 'Torre del Faro', 'Residencial Brisa', 'Torre Palmera', 'Oficinas Quintana',
  'Torre Náutica', 'Edificio Horizonte', 'Torre Sirena'];

// ---------- radio chatter (toasts while driving) ----------
export const RADIO_LINES = [
  'Radio Azahar FM: heat wave holds over the bay — 34 degrees and rising.',
  'Traffic: slow on Avenida del Faro after a fender-bender near the marina.',
  'Radio Azahar FM: the Charter Cup regatta starts Saturday at Marina del Sol.',
  'Weather: clear skies tonight, perfect for a drive up the Colinas.',
  'Radio Azahar FM: ABPD reminds drivers — the Interceptors got new engines.',
  'Sports: CD Azahar beat Puerto Real 2–1 in the coastal derby last night.',
  'Radio Azahar FM: lost charter tokens still wash up on Azahar Beach. Finders keepers.',
  'Traffic: roadworks on Calle 46, expect delays through Barrio Palmas.',
  'Radio Azahar FM: tonight, salsa under the palms at Plaza Central.',
  'News: the Marisol charter fleet denies everything, again, on the record.',
  'Radio Azahar FM: Clínica Costa reminds you — sunscreen is not armour.',
  'Traffic: a stalled Burro van is blocking Calle 92. Honking has not fixed it.',
  'Radio Azahar FM: the Charter Cup crews are still missing twenty brass tokens.',
  'Weather: a sea breeze off the bay by six — top-down driving weather.',
  'News: Inspectora Vega promoted after the harbour sting. Drivers, behave.',
  'Radio Azahar FM: salsa night at Plaza Central — the fountain is a dance floor.',
];

// ---------- shared mutable game state ----------
export const S = {
  mode: 'loading',            // loading | menu | play | pause | over | won
  paused: false,
  freeRoam: false,
  timeMin: 8 * 60,            // in-game clock, minutes since midnight
  day: 1,
  cash: 120,
  respect: 0,
  health: 100,
  armor: 0,
  wanted: 0,                  // 0..5 stars
  heat: 0,                    // fractional wanted accumulator
  hiddenTime: 0,              // seconds police have not seen the player
  bust: 0,                    // 0..1 bust meter
  inCar: null,                // car object the player drives, or null
  hasPistol: false,
  pistolAmmo: 24,
  pistolReserve: 48,
  weapon: 'fists',            // fists | pistol
  storyIndex: 0,              // next story mission
  storyDone: false,
  tokensFound: 0,
  taxiFaresDone: 0,
  racesWon: 0,
  carsStolen: 0,
  startStamp: 0,
  muted: false,
  shotMode: null,
  district: 'Centro',
  speedKmh: 0,
};

export const SAVE_KEY = 'azahar-heat-save-v4';
export const WORLD_SEED = 20261124;
