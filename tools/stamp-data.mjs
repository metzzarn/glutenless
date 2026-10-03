#!/usr/bin/env node
/**
 * Re-stamps data/beers-version.json after data/beers.json changes.
 *
 *   npm run stamp-data
 *
 * The app only syncs the hosted list when its `updatedAt` is newer than the
 * data it already has, so every change to beers.json needs a new stamp. The
 * stamp also records a hash of beers.json; __tests__/dataVersion.test.ts fails
 * when the two disagree, so a forgotten stamp is caught. Running this when
 * beers.json hasn't changed leaves the stamp alone.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const BEERS_PATH = join(DATA_DIR, 'beers.json');
const VERSION_PATH = join(DATA_DIR, 'beers-version.json');

/** Returns the new stamp, or null when beers.json already matches the current one. */
export function stampData(now = new Date()) {
  const sha256 = createHash('sha256').update(readFileSync(BEERS_PATH)).digest('hex');
  let current = null;
  try {
    current = JSON.parse(readFileSync(VERSION_PATH, 'utf8'));
  } catch {
    // No stamp yet: write the first one.
  }
  if (current?.sha256 === sha256) return null;

  const stamp = { updatedAt: now.toISOString(), sha256 };
  writeFileSync(VERSION_PATH, `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stamp = stampData();
  console.log(
    stamp ? `Stamped data/beers-version.json: ${stamp.updatedAt}` : 'data/beers.json unchanged — stamp left as is.'
  );
}
