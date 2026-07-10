import Constants from 'expo-constants';
import { upsertBeers, type Beer } from './db';

type RemoteBeer = Omit<Beer, 'favorite' | 'status'>;

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

/**
 * Fetches the full beer list from the hosted data/beers.json (served
 * straight from raw.githubusercontent.com — real HTTPS, no server process to
 * run, and no CDN cache lag after a push, unlike jsDelivr's @main alias) and
 * upserts it locally. Local bundled data always seeds first (see lib/db.ts:initDb),
 * so this is strictly best-effort — an unreachable host, a bad response, or
 * a timeout just means the app keeps running on whatever's already in
 * SQLite.
 */
export async function syncFromServer(): Promise<boolean> {
  const beersUrl = Constants.expoConfig?.extra?.beersUrl;
  if (typeof beersUrl !== 'string' || !beersUrl) {
    console.warn('[sync] no extra.beersUrl configured in app.json — skipping sync');
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const res = await fetch(beersUrl, { signal: controller.signal });
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

    await upsertBeers(data as RemoteBeer[]);
    return true;
  } catch (err) {
    console.warn(`[sync] failed to fetch ${beersUrl}:`, err);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
