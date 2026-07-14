import * as SQLite from 'expo-sqlite';
import { buildSearchClause, initDb, listBeers, getBeerById, toggleFavorite } from '../lib/db';
import beersSeed from '../data/beers.json';

describe('buildSearchClause', () => {
  it('has no WHERE clause for the "all" filter with no query', () => {
    expect(buildSearchClause('all', '')).toEqual({ where: '', params: [] });
  });

  it('adds a status filter', () => {
    expect(buildSearchClause('free', '')).toEqual({
      where: 'WHERE status = ?',
      params: ['free'],
    });
  });

  it('adds a text search filter', () => {
    expect(buildSearchClause('all', 'ipa')).toEqual({
      where: 'WHERE (name LIKE ? OR brewery LIKE ?)',
      params: ['%ipa%', '%ipa%'],
    });
  });

  it('combines both filters', () => {
    expect(buildSearchClause('low', 'lager')).toEqual({
      where: 'WHERE status = ? AND (name LIKE ? OR brewery LIKE ?)',
      params: ['low', '%lager%', '%lager%'],
    });
  });

  it('filters to favorites without a status param', () => {
    expect(buildSearchClause('favorite', '')).toEqual({
      where: 'WHERE favorite = 1',
      params: [],
    });
  });

  it('combines the favorite filter with a text search', () => {
    expect(buildSearchClause('favorite', 'ipa')).toEqual({
      where: 'WHERE favorite = 1 AND (name LIKE ? OR brewery LIKE ?)',
      params: ['%ipa%', '%ipa%'],
    });
  });
});

describe('db seeding + queries', () => {
  beforeAll(async () => {
    await initDb();
  });

  it('seeds every beer from data/beers.json', async () => {
    const all = await listBeers('all', '');
    expect(all).toHaveLength(beersSeed.length);
  });

  it('reseeding on relaunch does not duplicate rows or clobber favorites', async () => {
    await toggleFavorite(1);

    await initDb();

    const all = await listBeers('all', '');
    expect(all).toHaveLength(beersSeed.length);
    expect((await getBeerById(1))?.favorite).toBe(true);

    await toggleFavorite(1);
  });

  it('rebuilds a pre-existing table missing columns or with a stale NOT NULL ibu, without losing data', async () => {
    const db = (await SQLite.openDatabaseAsync('glutenless.db')) as unknown as {
      columns: Map<string, { notnull: boolean }>;
    };
    // Simulate an app installed on an older schema: missing `discontinued`,
    // and still carrying the original `ibu INTEGER NOT NULL` constraint that
    // the current dataset (which has null ibu values) can't satisfy.
    db.columns.delete('discontinued');
    db.columns.set('ibu', { notnull: true });

    await expect(initDb()).resolves.not.toThrow();

    expect(db.columns.has('discontinued')).toBe(true);
    expect(db.columns.get('ibu')?.notnull).toBe(false);

    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
    const daura = await getBeerById(129);
    expect(daura?.name).toBe('Daura Damm');
    expect(daura?.country).toBe('Spain');
  });

  it('removes rows that are no longer in data/beers.json instead of orphaning them', async () => {
    const db = (await SQLite.openDatabaseAsync('glutenless.db')) as unknown as {
      rows: Record<string, unknown>[];
    };
    db.rows.push({
      id: 999999,
      name: 'Discontinued Ale',
      brewery: 'Defunct Brewing',
      style: 'Ghost',
      abv: 5,
      ibu: 5,
      status: 'free',
      ppm: '<20 ppm',
      glutenFree: 1,
      glutenRemoved: 0,
      discontinued: 0,
      country: 'Nowhere',
      grains: '[]',
      note: 'no longer in the dataset',
      breweryUrl: '',
      confirmed: '[]',
      favorite: 0,
    });
    expect(await getBeerById(999999)).not.toBeNull();

    await initDb();

    expect(await getBeerById(999999)).toBeNull();
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('filters by gluten status', async () => {
    const free = await listBeers('free', '');
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((b) => b.status === 'free')).toBe(true);
  });

  it('searches by name/brewery substring', async () => {
    const results = await listBeers('all', 'ghostfish');
    expect(results.map((b) => b.name)).toContain('Grapefruit IPA');
  });

  it('fetches a single beer by id', async () => {
    const beer = await getBeerById(1);
    expect(beer?.name).toBe('Blonde');
    expect(beer?.brewery).toBe('Glutenberg (Brasseurs Sans Gluten)');
    expect(beer?.favorite).toBe(false);
  });

  it('round-trips grains, gluten flags, and breweryUrl', async () => {
    const daura = await getBeerById(129);
    expect(daura?.name).toBe('Daura Damm');
    expect(daura?.country).toBe('Spain');
    expect(daura?.grains).toEqual(['barley']);
    expect(daura?.glutenFree).toBe(false);
    expect(daura?.glutenRemoved).toBe(true);
    expect(daura?.breweryUrl).toBe('https://www.estrelladamm.com/');

    const glutenberg = await getBeerById(1);
    expect(glutenberg?.grains).toEqual(['millet', 'corn']);
    expect(glutenberg?.glutenRemoved).toBe(false);
    expect(glutenberg?.breweryUrl).toBe('https://www.glutenberg.ca/');
  });

  it('round-trips a null ibu and a discontinued flag', async () => {
    const redAle = await getBeerById(4); // Red / Rousse (Glutenberg), ibu: null
    expect(redAle?.ibu).toBeNull();

    const aurochs = await getBeerById(69); // Porter (Aurochs), discontinued
    expect(aurochs?.discontinued).toBe(true);

    const glutenberg = await getBeerById(1);
    expect(glutenberg?.discontinued).toBe(false);
  });

  it('returns null for an unknown id', async () => {
    expect(await getBeerById(9999)).toBeNull();
  });

  it('toggles favorite state', async () => {
    expect(await toggleFavorite(1)).toBe(true);
    expect((await getBeerById(1))?.favorite).toBe(true);
    expect(await toggleFavorite(1)).toBe(false);
    expect((await getBeerById(1))?.favorite).toBe(false);
  });

  it('lists only favorited beers for the favorite filter', async () => {
    await toggleFavorite(1);
    await toggleFavorite(10);

    const favorites = await listBeers('favorite', '');
    expect(favorites.map((b) => b.id).sort((a, b) => a - b)).toEqual([1, 10]);
    expect(favorites.every((b) => b.favorite)).toBe(true);

    await toggleFavorite(1);
    await toggleFavorite(10);
  });
});
