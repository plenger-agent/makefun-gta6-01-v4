// AZAHAR HEAT — hand-in program for the make.fun gta6-01 competition (Node 22, stdlib only).
// The game itself is the static game/ folder beside this file: plain files a desktop browser
// loads fully offline (game/index.html plus its ES modules and the vendored Three.js build).
// This program copies game/ and screenshots/ into the output directory and writes
// dossier.json there with the vendored make.fun library, exactly as the kit describes.
//
// IMPORTANT (grader note): the output directory is a MOUNT POINT inside the grader.
// Deleting the directory itself fails with EBUSY and kills the hand-in, so we never remove
// the output directory — we only clear its *contents*, entry by entry, before copying.
// The hand-in is deterministic: no timestamps and no randomness are written anywhere.
//
// Local run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Local play: node serve.ts  ->  http://localhost:8080

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Clear only the contents of the output directory, never the directory itself.
// (An earlier entry died exactly here: rmSync on the mount point -> EBUSY -> no game.)
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
  rmSync(join(out, entry), { recursive: true, force: true });
}

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the counted
// bytes; the others refuse an entry the scorer itself would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game files
// in total, or a path under game/ longer than 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
