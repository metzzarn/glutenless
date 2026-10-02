jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        beersUrl: 'https://cdn.example/beers.json',
        beersVersionUrl: 'https://cdn.example/beers-version.json',
      },
    },
  },
}));

import { Storage } from 'expo-sqlite/kv-store';
import { countChanges, getLastSync, syncFromServer } from '../lib/sync';
import { BUNDLED_VERSION, getLocalVersion } from '../lib/dataVersion';
import { initDb, listBeers } from '../lib/db';
import beersSeed from '../data/beers.json';

function beerPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 500,
    name: 'Synced Test Beer',
    brewery: 'Test Brewery',
    style: 'Test Style',
    abv: 5,
    ibu: null,
    ppm: '<20 ppm',
    glutenFree: true,
    glutenRemoved: false,
    discontinued: false,
    country: 'USA',
    grains: ['sorghum'],
    note: 'test',
    breweryUrl: 'https://example.com/',
    ...overrides,
  };
}

const NEWER = '2999-01-01T00:00:00.000Z';

/** Fakes the server: the version stamp and the beer list, each of which can fail. */
function serve(
  beers: unknown,
  { version = NEWER as unknown, versionOk = true, beersOk = true } = {}
) {
  globalThis.fetch = jest.fn(async (url: string) =>
    url.includes('beers-version.json')
      ? { ok: versionOk, status: 404, statusText: 'Not Found', json: async () => ({ updatedAt: version }) }
      : { ok: beersOk, status: 500, statusText: 'Server Error', json: async () => beers }
  ) as unknown as typeof fetch;
  return globalThis.fetch as jest.Mock;
}

describe('syncFromServer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    // A fresh install each time: no stored version, so initDb seeds the bundled list.
    Storage.clearSync();
    await initDb();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('records when it last synced and how many beers changed', async () => {
    const seeded = await listBeers('all', '');
    const edited = { ...seeded[0], note: 'Edited note' };
    serve([edited, ...seeded.slice(1)]);

    expect(await syncFromServer()).toBe(true);
    const lastSync = getLastSync();
    expect(lastSync?.changes).toBe(1);
    expect(Date.now() - new Date(lastSync!.at).getTime()).toBeLessThan(5000);
  });

  it('upserts beers from a successful response', async () => {
    serve([beerPayload()]);

    expect(await syncFromServer()).toBe(true);

    const results = await listBeers('all', 'Synced Test Beer');
    expect(results).toHaveLength(1);
    expect(results[0].grains).toEqual(['sorghum']);
    expect(results[0].ibu).toBeNull();
  });

  it('treats the response as the complete set, removing beers not included', async () => {
    serve([beerPayload()]);

    await syncFromServer();

    const all = await listBeers('all', '');
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(500);
  });

  it('returns false and leaves local data untouched on a non-ok response', async () => {
    serve([beerPayload()], { beersOk: false });

    expect(await syncFromServer()).toBe(false);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('returns false when the response is not a valid beer array', async () => {
    serve(({ not: 'an array' }));

    expect(await syncFromServer()).toBe(false);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('returns false when a beer object is missing required fields', async () => {
    serve([{ id: 1, name: 'Incomplete' }]);

    expect(await syncFromServer()).toBe(false);
  });

  it('pinpoints the first invalid item: not an array, not an object, or missing fields', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const respond = (body: unknown) => serve(body);

    respond('not a list');
    expect(await syncFromServer()).toBe(false);
    respond([]);
    expect(await syncFromServer()).toBe(false);
    respond([beerPayload(), 42]);
    expect(await syncFromServer()).toBe(false);
    respond([{ id: 7 }]);
    expect(await syncFromServer()).toBe(false);

    const reasons = warn.mock.calls.map((call) => String(call[0]));
    expect(reasons).toEqual([
      expect.stringContaining('expected an array, got string'),
      expect.stringContaining('array was empty'),
      expect.stringContaining('item at index 1 is not an object (got number)'),
      expect.stringContaining('item index 0 is missing: name'),
    ]);
    warn.mockRestore();
  });

  it('gives up after the timeout instead of hanging on a slow server', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    ) as unknown as typeof fetch;

    const result = syncFromServer();
    jest.advanceTimersByTime(5000);
    expect(await result).toBe(false);

    warn.mockRestore();
    jest.useRealTimers();
  });

  it('skips syncing when a server address is not configured', async () => {
    const Constants = jest.requireMock('expo-constants').default;
    const extra = Constants.expoConfig.extra;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = jest.fn() as unknown as typeof fetch;

    for (const missing of [{}, { beersUrl: extra.beersUrl }, { beersVersionUrl: extra.beersVersionUrl }]) {
      Constants.expoConfig.extra = missing;
      expect(await syncFromServer()).toBe(false);
    }
    Constants.expoConfig = undefined;
    expect(await syncFromServer()).toBe(false);
    Constants.expoConfig = { extra };
    expect(globalThis.fetch).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('only downloads the list when the server has a newer version, then remembers that version', async () => {
    const fetchMock = serve([beerPayload()]);
    expect(await syncFromServer()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://cdn.example/beers.json?v=${encodeURIComponent(NEWER)}`);
    expect(getLocalVersion()).toBe(NEWER);

    fetchMock.mockClear();
    expect(await syncFromServer()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // just the stamp: nothing new
    expect(await listBeers('all', '')).toHaveLength(1);
  });

  it('keeps local data that is newer than the server, e.g. unpublished edits being tested', async () => {
    const fetchMock = serve([beerPayload()], { version: '2020-01-01T00:00:00.000Z' });

    expect(await syncFromServer()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
    expect(getLocalVersion()).toBe(BUNDLED_VERSION);
    expect(getLastSync()?.changes).toBe(0);
  });

  it('does not download the same version it already has', async () => {
    const fetchMock = serve([beerPayload()], { version: BUNDLED_VERSION });
    expect(await syncFromServer()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('fails without touching local data when the version stamp is missing or unreadable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    serve([beerPayload()], { versionOk: false });
    expect(await syncFromServer()).toBe(false);
    serve([beerPayload()], { version: 'yesterday' });
    expect(await syncFromServer()).toBe(false);
    serve([beerPayload()], { version: 42 });
    expect(await syncFromServer()).toBe(false);

    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
    expect(getLocalVersion()).toBe(BUNDLED_VERSION);
    warn.mockRestore();
  });

  it('returns false when fetch throws (network error / timeout)', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network fail')) as unknown as typeof fetch;

    expect(await syncFromServer()).toBe(false);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });
});

describe('countChanges', () => {
  it('counts added, removed and edited beers, and ignores user-only fields', async () => {
    await initDb();
    const current = await listBeers('all', '');
    const [first, second, ...rest] = current;

    expect(countChanges(current, current)).toBe(0);
    expect(countChanges(current, [{ ...first, favorite: true, personalNote: 'mine' }, second, ...rest])).toBe(0);
    expect(countChanges(current, [{ ...first, ppm: '<5 ppm' }, second, ...rest])).toBe(1);
    expect(countChanges(current, [first, ...rest])).toBe(1);
    expect(countChanges(current, [...current, beerPayload() as never])).toBe(1);
  });
});

describe('getLastSync', () => {
  it('is null before the first sync', () => {
    Storage.clearSync();
    expect(getLastSync()).toBeNull();
  });

  it('is null rather than crashing when the stored value is unreadable', () => {
    Storage.setItemSync('lastSync', '{not json');
    expect(getLastSync()).toBeNull();
  });

  it('still reports a successful sync when the time cannot be saved', async () => {
    await initDb();
    const setItemSync = jest.spyOn(Storage, 'setItemSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    serve(await listBeers('all', ''));

    expect(await syncFromServer()).toBe(true);
    setItemSync.mockRestore();
  });
});
