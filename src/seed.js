import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './load-env.js';

/*
 * Seed the data dir on first boot.
 *
 * data/houses.json is the source of truth for every listing. In production it
 * lives on a persistent disk mounted at /app/data, which is empty on the very
 * first deploy — so the image bakes a copy at /app/seed/houses.json and we copy
 * it into place if the disk doesn't have one yet. Never overwrites an existing
 * file, so admin edits (updateHouse) survive redeploys. No-op in local dev.
 */
export function ensureSeedData() {
  const dataDir = resolve(root, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const target = resolve(dataDir, 'houses.json');
  const seed = resolve(root, 'seed', 'houses.json');
  if (!existsSync(target) && existsSync(seed)) {
    copyFileSync(seed, target);
    console.log('[Seed] data/houses.json создан из seed/houses.json');
  }
}
