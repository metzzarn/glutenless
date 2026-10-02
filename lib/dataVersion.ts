import { Storage } from 'expo-sqlite/kv-store';
import bundledStamp from '../data/beers-version.json';

/**
 * Which version of the beer list the local database holds, so neither the
 * bundled list (re-seeded at launch) nor the hosted one (synced) can replace
 * newer data with older. Versions are the `updatedAt` stamps that
 * tools/stamp-data.mjs writes to data/beers-version.json.
 */
export const BUNDLED_VERSION: string = bundledStamp.updatedAt;

const STORAGE_KEY = 'dataVersion';

export function getLocalVersion(): string | null {
  try {
    return Storage.getItemSync(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLocalVersion(version: string) {
  try {
    Storage.setItemSync(STORAGE_KEY, version);
  } catch {
    // Without it the next launch re-seeds and re-syncs, which is safe, just slower.
  }
}

/** Whether `candidate` is a newer version than `current`. Anything is newer than no version; an unreadable stamp never is. */
export function isNewerVersion(candidate: string, current: string | null): boolean {
  const candidateTime = Date.parse(candidate);
  if (Number.isNaN(candidateTime)) return false;
  if (current === null) return true;
  const currentTime = Date.parse(current);
  return Number.isNaN(currentTime) || candidateTime > currentTime;
}
