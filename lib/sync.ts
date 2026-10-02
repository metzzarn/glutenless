import Constants from 'expo-constants';
import { Storage } from 'expo-sqlite/kv-store';
import { getLocalVersion, isNewerVersion, setLocalVersion } from './dataVersion';
import { listBeers, upsertBeers, type Beer, type BeerData } from './db';

type RemoteBeer = BeerData;

const REQUIRED_KEYS: (keyof RemoteBeer)[] = [
  'id',
  'name',
  'brewery',
  'style',
  'abv',
  'ibu',
  'ppm',
  'glutenFree',
  'glutenRemoved',
  'discontinued',
  'country',
  'grains',
  'note',
  'breweryUrl',
];

type ValidationResult = { valid: true } | { valid: false; reason: string };

/** Same check as before, but pinpoints which item/field is wrong instead of just failing. */
function validateRemoteBeers(data: unknown): ValidationResult {
  if (!Array.isArray(data)) return { valid: false, reason: `expected an array, got ${typeof data}` };
  if (data.length === 0) return { valid: false, reason: 'array was empty' };

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (typeof item !== 'object' || item === null) {
      return { valid: false, reason: `item at index ${i} is not an object (got ${typeof item})` };
    }
    const missing = REQUIRED_KEYS.filter((key) => !(key in item));
    if (missing.length > 0) {
      const label = 'name' in item ? `"${(item as Record<string, unknown>).name}"` : `index ${i}`;
      return { valid: false, reason: `item ${label} is missing: ${missing.join(', ')}` };
    }
  }
  return { valid: true };
}

const SYNC_TIMEOUT_MS = 5000;

/** When the list last came from the server, and how many beers that update added, removed or changed. */
export type LastSync = { at: string; changes: number };

const LAST_SYNC_KEY = 'lastSync';

export function getLastSync(): LastSync | null {
  try {
    const stored = Storage.getItemSync(LAST_SYNC_KEY);
    return stored ? (JSON.parse(stored) as LastSync) : null;
  } catch {
    return null;
  }
}

/** Beers added, removed, or with any dataset field changed between the local list and an incoming one. */
export function countChanges(current: Beer[], incoming: RemoteBeer[]): number {
  const fields = [...REQUIRED_KEYS, 'confirmed'] as (keyof RemoteBeer)[];
  const fingerprint = (b: RemoteBeer) => JSON.stringify(fields.map((f) => b[f] ?? null));
  const currentById = new Map(current.map((b) => [b.id, fingerprint(b)]));
  const incomingIds = new Set(incoming.map((b) => b.id));

  let changes = current.filter((b) => !incomingIds.has(b.id)).length;
  for (const b of incoming) {
    if (currentById.get(b.id) !== fingerprint(b)) changes++;
  }
  return changes;
}

/**
 * Fetches the full beer list from the hosted data/beers.json (served
 * straight from raw.githubusercontent.com — real HTTPS, no server process to
 * run, and no CDN cache lag after a push, unlike jsDelivr's @main alias) and
 * upserts it locally. Local bundled data always seeds first (see lib/db.ts:initDb),
 * so this is strictly best-effort — an unreachable host, a bad response, or
 * a timeout just means the app keeps running on whatever's already in
 * SQLite.
 */
function recordSync(changes: number) {
  try {
    Storage.setItemSync(LAST_SYNC_KEY, JSON.stringify({ at: new Date().toISOString(), changes }));
  } catch {
    // Only the "updated …" label depends on this.
  }
}

export async function syncFromServer(): Promise<boolean> {
  const { beersUrl, beersVersionUrl } = Constants.expoConfig?.extra ?? {};
  if (typeof beersUrl !== 'string' || !beersUrl || typeof beersVersionUrl !== 'string' || !beersVersionUrl) {
    console.warn('[sync] extra.beersUrl or extra.beersVersionUrl missing from app.json — skipping sync');
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    // The small version stamp first: the list itself is only downloaded when
    // it's newer than what's already here, so unpublished local edits to
    // data/beers.json (or a newer app bundle) are never replaced by older data.
    const versionRes = await fetch(beersVersionUrl, { signal: controller.signal });
    if (!versionRes.ok) {
      console.warn(`[sync] ${beersVersionUrl} responded ${versionRes.status} ${versionRes.statusText}`);
      return false;
    }
    const remoteVersion = ((await versionRes.json()) as { updatedAt?: unknown })?.updatedAt;
    if (typeof remoteVersion !== 'string' || Number.isNaN(Date.parse(remoteVersion))) {
      console.warn(`[sync] ${beersVersionUrl} has no valid updatedAt`);
      return false;
    }
    if (!isNewerVersion(remoteVersion, getLocalVersion())) {
      recordSync(0);
      return true;
    }

    // The version in the query gets past CDN caching, so a fresh stamp can't come with a stale list.
    const res = await fetch(`${beersUrl}?v=${encodeURIComponent(remoteVersion)}`, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[sync] ${beersUrl} responded ${res.status} ${res.statusText}`);
      return false;
    }

    const data: unknown = await res.json();
    const validation = validateRemoteBeers(data);
    if (!validation.valid) {
      console.warn(`[sync] response was not a valid beer array: ${validation.reason}`);
      return false;
    }

    const incoming = data as RemoteBeer[];
    const changes = countChanges(await listBeers(), incoming);
    await upsertBeers(incoming);
    setLocalVersion(remoteVersion);
    recordSync(changes);
    return true;
  } catch (err) {
    console.warn(`[sync] failed to fetch ${beersUrl}:`, err);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
