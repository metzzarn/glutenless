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

function isValidRemoteBeers(data: unknown): data is RemoteBeer[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every(
    (item) =>
      typeof item === 'object' && item !== null && REQUIRED_KEYS.every((key) => key in item)
  );
}

const SYNC_TIMEOUT_MS = 5000;

/**
 * Fetches the full beer list from the hosted data/beers.json (served over
 * jsDelivr's GitHub CDN — real HTTPS, no server process to run) and upserts
 * it locally. Local bundled data always seeds first (see lib/db.ts:initDb),
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
    if (!isValidRemoteBeers(data)) {
      console.warn('[sync] response was not a valid beer array:', data);
      return false;
    }

    await upsertBeers(data);
    return true;
  } catch (err) {
    console.warn(`[sync] failed to fetch ${beersUrl}:`, err);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
