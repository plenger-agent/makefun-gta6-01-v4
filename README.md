# AZAHAR HEAT

[![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/plenger-agent/makefun-gta6-01-v4/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/plenger-agent/makefun-gta6-01-v4/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game built with Three.js for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). No assets, no build step,
no network requests: every mesh is procedural, every sound is synthesized WebAudio,
and the whole city runs from static files under `game/`.

## The game

You are **Rafa Cordero**, a wheelman who left Azahar Bay six years ago and has just
washed back in — broke, remembered, and already in debt to **Doña Carmen Marisol**,
whose charter fleet runs Marina del Sol and half of everything else that floats.
Work her jobs, dodge **Inspectora Vega** of the ABPD, and run one last tide against
the Syndicate that wants the harbour for itself.

## What's in the city

- **A full open world**: a gridded coastal city with five districts — Downtown Azahar,
  Azahar Beach and its boardwalk umbrellas, Marina del Sol with piers, Barrio Palmas,
  Colinas Heights suburbs, Viejo Puerto and the Puerto Industrial container yards —
  plus Plaza Central, palms, lamps, signage, a beach and animated ocean.
- **On foot and behind the wheel**: walk, run, sprint and hop; enter and steal any of
  nine distinct car models (sedan, hatch, taxi, Víbora GT sports, Toro muscle, van,
  pickup, charter buggy, police Interceptor), each with its own speed, grip and value.
- **Traffic and pedestrians**: AI traffic circulates the road network, slows for
  obstacles and honks when stuck; two dozen pedestrians stroll, chat, and flee from
  speeding cars, fights and gunfire.
- **A wanted system**: crimes (theft, collisions, assaults, shots fired) raise a
  0–5 star heat level; Interceptors spawn, pursue, PIT and box you in while a bust
  meter fills. Break line of sight and the heat decays.
- **Combat**: fists plus the Marlin pistol — hitscan shots with tracers and muzzle
  flash, reloads, armour and health, busted/wasted outcomes with clinic and ABPD
  respawn penalties.
- **A six-mission story** with named characters and full dialogue: *Homecoming*,
  *A Fare Warning*, *Harbour Fees*, *Night Regatta*, *The Inspectora* and
  *The Last Tide* — go-to, delivery, pickup, chase, race and escape objectives with
  cash and respect rewards.
- **Side activities**: repeatable taxi fares with clean-driving tips, the Faro Sprint
  checkpoint race, payphone errands, and 20 lost charter tokens hidden across the bay.
- **Presentation**: day/night cycle with sunset lighting, headlights-and-lamps night
  mood, a live minimap (roads, traffic, flashing police, mission and activity
  markers), wanted stars, cash, health/armour/bust bars, speedometer, dialogue
  banners, toasts, particles, skid marks, screen shake, and synthesized engine,
  siren, surf and effect sounds. Progress saves to localStorage.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Shift | Sprint · sharper driving |
| Space | Handbrake · hop |
| E / F | Interact · enter/exit car · advance dialogue |
| Mouse | Orbit camera · hold left button to punch / shoot |
| 1 / 2 | Fists / pistol |
| R | Reload |
| M | Mute |
| Esc / P | Pause |
| H | Help |

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
node main.ts           # hand-in: copies game/ + screenshots/ out and writes dossier.json
```

Screenshot poses for the gallery are built in: open
`game/index.html?shot=cover`, `?shot=drive`, `?shot=chase` or `?shot=mission`.

## Structure

`game/src/` is split into single-job modules: `world.js` (city + lighting),
`vehicles.js` / `traffic.js` (cars + traffic AI), `player.js`, `pedestrians.js`,
`police.js` / `wanted.js`, `combat.js`, `missions.js` (the story), `activities.js`,
`hud.js` / `minimap.js`, `camera.js`, `audio.js`, `effects.js`, `input.js`,
`save.js`, `config.js` and `main.js`. Three.js is vendored at
`game/vendor/three.module.min.js`.

## Development notes

- Deterministic world: the city is generated from a fixed seed, so every player —
  and every screenshot — sees the same Azahar Bay.
- Performance: shared geometries/materials, pooled particles and skid marks, capped
  traffic (13) and pedestrian (26) pools, and a pre-rendered minimap base keep the
  frame budget flat no matter how chaotic the chase gets.
- The hand-in (`main.ts`) never deletes the output directory itself — only its
  contents — because the grader mounts the output as a directory of its own.

## License

MIT — see `LICENSE`.
