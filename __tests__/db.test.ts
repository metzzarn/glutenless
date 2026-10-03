import * as SQLite from 'expo-sqlite';
import {
  buildSearchClause,
  filterBeers,
  initDb,
  listBeers,
  getBeerById,
  toggleFavorite,
  setPersonalNote,
  upsertBeers,
  type Beer,
  type BeerData,
} from '../lib/db';
import { Storage } from 'expo-sqlite/kv-store';
import beersSeed from '../data/beers.json';
import { BUNDLED_VERSION, getLocalVersion, setLocalVersion } from '../lib/dataVersion';

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

describe('filterBeers', () => {
  const beer = (over: Partial<Beer>) => ({ status: 'free', favorite: false, ...over }) as Beer;
  const beers = [
    beer({ id: 1, name: 'Grapefruit IPA', brewery: 'Ghostfish' }),
    beer({ id: 2, name: 'Daura', brewery: 'Damm', status: 'low' }),
    beer({ id: 3, name: 'Blonde', brewery: 'Glutenberg', favorite: true }),
  ];
  const ids = (filter: Parameters<typeof filterBeers>[1], query = '') =>
    filterBeers(beers, filter, query).map((b) => b.id);

  it('returns everything, in order, for "all" with no query', () => {
    expect(ids('all')).toEqual([1, 2, 3]);
  });

  it('filters by status and by favorite', () => {
    expect(ids('free')).toEqual([1, 3]);
    expect(ids('low')).toEqual([2]);
    expect(ids('favorite')).toEqual([3]);
  });

  it('matches name or brewery, ignoring case and surrounding spaces', () => {
    expect(ids('all', ' ipa ')).toEqual([1]);
    expect(ids('all', 'DAMM')).toEqual([2]);
  });

  it('combines the tab filter with the query', () => {
    expect(ids('free', 'gl')).toEqual([3]);
    expect(ids('low', 'ipa')).toEqual([]);
  });
});

describe('db seeding + queries', () => {
  beforeAll(async () => {
    Storage.clearSync();
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
    const db = await SQLite.openDatabaseAsync('glutenless.db');
    // Simulate an app installed on an older schema: no `discontinued` or
    // `personalNote`, and still the original `ibu INTEGER NOT NULL` constraint
    // that the current dataset (which has null ibu values) can't satisfy.
    const seed = beersSeed.find((b) => b.id === 1)!;
    await db.execAsync(`
      DROP TABLE beers;
      CREATE TABLE beers (
        id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, brewery TEXT NOT NULL,
        style TEXT NOT NULL, abv REAL NOT NULL, ibu INTEGER NOT NULL, status TEXT NOT NULL,
        ppm TEXT NOT NULL, glutenFree INTEGER NOT NULL DEFAULT 0, glutenRemoved INTEGER NOT NULL DEFAULT 0,
        country TEXT NOT NULL DEFAULT '', grains TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL,
        breweryUrl TEXT NOT NULL DEFAULT '', confirmed TEXT NOT NULL DEFAULT '[]',
        favorite INTEGER NOT NULL DEFAULT 0
      );
    `);
    await db.runAsync(
      `INSERT INTO beers (id, name, brewery, style, abv, ibu, status, ppm, note, favorite)
       VALUES (?, ?, ?, ?, ?, ?, 'free', ?, ?, 1)`,
      [seed.id, seed.name, seed.brewery, seed.style, seed.abv, seed.ibu ?? 0, seed.ppm, seed.note]
    );

    await expect(initDb()).resolves.not.toThrow();

    const columns = await db.getAllAsync<{ name: string; notnull: number }>('PRAGMA table_info(beers)');
    const column = (name: string) => columns.find((c) => c.name === name);
    expect(column('discontinued')).toBeDefined();
    expect(column('personalNote')).toBeDefined();
    expect(column('ibu')?.notnull).toBe(0);

    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
    const upgraded = await getBeerById(1);
    expect(upgraded?.favorite).toBe(true);
    expect(upgraded?.personalNote).toBe('');
    expect(upgraded?.grains).toEqual(seed.grains);
    await toggleFavorite(1);
  });

  it('removes rows that are no longer in data/beers.json instead of orphaning them', async () => {
    const db = await SQLite.openDatabaseAsync('glutenless.db');
    await db.runAsync(
      `INSERT INTO beers (id, name, brewery, style, abv, ibu, status, ppm, note)
       VALUES (999999, 'Discontinued Ale', 'Defunct Brewing', 'Ghost', 5, 5, 'free', '<20 ppm', 'no longer in the dataset')`
    );
    expect(await getBeerById(999999)).not.toBeNull();

    setLocalVersion('2000-01-01T00:00:00.000Z'); // an app update bringing a newer bundled list
    await initDb();

    expect(await getBeerById(999999)).toBeNull();
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('treats an empty batch as "nothing to update" rather than deleting every beer', async () => {
    await upsertBeers([]);
    expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
  });

  it('records the bundled version as what the database holds after seeding', () => {
    expect(getLocalVersion()).toBe(BUNDLED_VERSION);
  });

  describe('re-seeding at launch', () => {
    const db = () => SQLite.openDatabaseAsync('glutenless.db');
    const noteOfBeer1 = async () => (await getBeerById(1))?.note;
    const seededNote = beersSeed.find((b) => b.id === 1)!.note;

    afterEach(async () => {
      setLocalVersion('2000-01-01T00:00:00.000Z');
      await initDb(); // back to the bundled list
    });

    it('keeps newer synced data on a normal relaunch', async () => {
      await (await db()).runAsync("UPDATE beers SET note = 'from a newer sync' WHERE id = 1");
      setLocalVersion('2999-01-01T00:00:00.000Z');

      await initDb();
      expect(await noteOfBeer1()).toBe('from a newer sync');
    });

    it('does not re-seed when the bundled list is the one already stored', async () => {
      await (await db()).runAsync("UPDATE beers SET note = 'unchanged' WHERE id = 1");
      await initDb();
      expect(await noteOfBeer1()).toBe('unchanged');
    });

    it('re-seeds when the bundled list is newer than the stored data', async () => {
      await (await db()).runAsync("UPDATE beers SET note = 'old' WHERE id = 1");
      setLocalVersion('2000-01-01T00:00:00.000Z');

      await initDb();
      expect(await noteOfBeer1()).toBe(seededNote);
      expect(getLocalVersion()).toBe(BUNDLED_VERSION);
    });

    it('re-seeds an empty table whatever the stored version says', async () => {
      await (await db()).runAsync('DELETE FROM beers');
      setLocalVersion('2999-01-01T00:00:00.000Z');

      await initDb();
      expect(await listBeers('all', '')).toHaveLength(beersSeed.length);
    });
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

  // Expected values come from the seed itself, so editing data/beers.json can't break these.
  it('round-trips grains, gluten flags, and breweryUrl', async () => {
    const removed = beersSeed.find((b) => b.glutenRemoved && b.grains.length > 1 && b.breweryUrl)!;
    const free = beersSeed.find((b) => b.glutenFree && b.grains.length > 1 && b.breweryUrl)!;

    for (const seed of [removed, free]) {
      const beer = await getBeerById(seed.id);
      expect(beer?.name).toBe(seed.name);
      expect(beer?.country).toBe(seed.country);
      expect(beer?.grains).toEqual(seed.grains);
      expect(beer?.glutenFree).toBe(seed.glutenFree);
      expect(beer?.glutenRemoved).toBe(seed.glutenRemoved);
      expect(beer?.breweryUrl).toBe(seed.breweryUrl);
    }
  });

  it('round-trips a null ibu and a discontinued flag', async () => {
    const noIbu = beersSeed.find((b) => b.ibu === null)!;
    expect((await getBeerById(noIbu.id))?.ibu).toBeNull();

    const discontinued = beersSeed.find((b) => b.discontinued)!;
    expect((await getBeerById(discontinued.id))?.discontinued).toBe(true);

    const current = beersSeed.find((b) => !b.discontinued)!;
    expect((await getBeerById(current.id))?.discontinued).toBe(false);
  });

  it('lists discontinued beers after current ones, each group sorted by name ignoring case', async () => {
    const all = await listBeers('all', '');
    const firstDiscontinued = all.findIndex((b) => b.discontinued);
    expect(firstDiscontinued).toBeGreaterThan(0);
    expect(all.slice(firstDiscontinued).every((b) => b.discontinued)).toBe(true);

    const current = all.slice(0, firstDiscontinued).map((b) => b.name);
    // Case-insensitive, so "Alpenglow" comes before "AVA".
    const lower = current.map((n) => n.toLowerCase());
    expect(lower).toEqual([...lower].sort());
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

  it('keeps a personal note through a data update', async () => {
    await setPersonalNote(1, '  Sold at the corner shop  ');
    expect((await getBeerById(1))?.personalNote).toBe('Sold at the corner shop');

    await upsertBeers(beersSeed as BeerData[]);
    expect((await getBeerById(1))?.personalNote).toBe('Sold at the corner shop');

    await setPersonalNote(1, '');
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
