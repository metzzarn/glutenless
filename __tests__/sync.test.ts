jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { beersUrl: 'https://cdn.example/beers.json' } } },
}));

import { syncFromServer } from '../lib/sync';
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

describe('syncFromServer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await initDb();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('upserts beers from a successful response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [beerPayload()],
    }) as unknown as typeof fetch;

    expect(await syncFromServer()).toBe(true);

    const results = await listBeers('all', 'Synced Test Beer');
    expect(results).toHaveLength(1);
    expect(results[0].grains).toEqual(['sorghum']);
    expect(results[0].ibu).toBeNull();
  });

  it('treats the response as the complete set, removing beers not included', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [beerPayload()],
    }) as unknown as typeof fetch;

    await syncFromServer();

    const all = await listBeers('all', '');
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(500);
  });

  it('returns false and leaves local data untouched on a non-ok response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    expect(await syncFromServer()).toBe(false);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('returns false when the response is not a valid beer array', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ not: 'an array' }),
    }) as unknown as typeof fetch;

    expect(await syncFromServer()).toBe(false);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('returns false when a beer object is missing required fields', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: 'Incomplete' }],
    }) as unknown as typeof fetch;

    expect(await syncFromServer()).toBe(false);
  });

  it('returns false when fetch throws (network error / timeout)', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network fail')) as unknown as typeof fetch;

    expect(await syncFromServer()).toBe(false);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });
});
