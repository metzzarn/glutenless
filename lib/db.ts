import * as SQLite from 'expo-sqlite';
import beersSeed from '../data/beers.json';
import { statusFromFlags, type FilterKey, type GlutenStatus } from './status';

export type Beer = {
  id: number;
  name: string;
  brewery: string;
  style: string;
  abv: number;
  ibu: number | null;
  status: GlutenStatus;
  ppm: string;
  glutenFree: boolean;
  glutenRemoved: boolean;
  discontinued: boolean;
  country: string;
  grains: string[];
  note: string;
  breweryUrl: string;
  favorite: boolean;
};

type BeerRow = Omit<Beer, 'favorite' | 'glutenFree' | 'glutenRemoved' | 'discontinued' | 'grains'> & {
  favorite: number;
  glutenFree: number;
  glutenRemoved: number;
  discontinued: number;
  grains: string;
};

const rowToBeer = (row: BeerRow): Beer => ({
  ...row,
  favorite: !!row.favorite,
  glutenFree: !!row.glutenFree,
  glutenRemoved: !!row.glutenRemoved,
  discontinued: !!row.discontinued,
  grains: JSON.parse(row.grains) as string[],
});

let dbPromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

async function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('glutenless.db');
  return dbPromise;
}

// The canonical current schema. Kept as one fragment so both the fresh-install
// CREATE TABLE and the rebuild-migration path below always agree.
const TABLE_COLUMNS_DDL = `
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  brewery TEXT NOT NULL,
  style TEXT NOT NULL,
  abv REAL NOT NULL,
  ibu INTEGER,
  status TEXT NOT NULL,
  ppm TEXT NOT NULL,
  glutenFree INTEGER NOT NULL DEFAULT 0,
  glutenRemoved INTEGER NOT NULL DEFAULT 0,
  discontinued INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  grains TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL,
  breweryUrl TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0
`;

const CANONICAL_COLUMNS = [
  'id', 'name', 'brewery', 'style', 'abv', 'ibu', 'status', 'ppm',
  'glutenFree', 'glutenRemoved', 'discontinued', 'country', 'grains', 'note', 'breweryUrl', 'favorite',
];

/**
 * `CREATE TABLE IF NOT EXISTS` is a no-op against an already-installed app's
 * existing table, so schema changes (new columns, or here, relaxing `ibu`'s
 * NOT NULL) never reach it on their own. SQLite can't ALTER a column's NOT
 * NULL constraint directly, so when the live schema doesn't match what the
 * app expects, rebuild the table: create it fresh, copy over whatever
 * columns already existed (new ones just take their DEFAULT), swap it in.
 * The seed upsert right after this fills in real values for any column that
 * only got a placeholder default from the copy.
 */
async function migrateSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await db.getAllAsync<{ name: string; notnull: number }>(
    'PRAGMA table_info(beers)'
  );
  const existingNames = new Set(existing.map((c) => c.name));
  const ibuIsNotNull = existing.find((c) => c.name === 'ibu')?.notnull === 1;
  const missingColumns = CANONICAL_COLUMNS.some((name) => !existingNames.has(name));

  if (!missingColumns && !ibuIsNotNull) return;

  const copyColumns = CANONICAL_COLUMNS.filter((name) => existingNames.has(name)).join(', ');
  await db.execAsync('DROP TABLE beers_new;');
  await db.execAsync(`CREATE TABLE beers_new (${TABLE_COLUMNS_DDL});`);
  await db.execAsync(`INSERT INTO beers_new (${copyColumns}) SELECT ${copyColumns} FROM beers;`);
  await db.execAsync('DROP TABLE beers;');
  await db.execAsync('ALTER TABLE beers_new RENAME TO beers;');
}

/**
 * Upserts a full batch of beers by id and never touches `favorite`, so an
 * update never wipes out anything the user has already favorited. Gluten
 * status isn't carried on the input — it's derived from glutenFree so the
 * two can't drift. Treats `beers` as the complete authoritative set: any
 * existing row whose id isn't in it gets deleted, so a beer removed from the
 * bundled dataset (or from the server on a future sync) doesn't linger as an
 * orphan. Shared by the bundled-JSON seed (`initDb`) and server sync
 * (`lib/sync.ts`) so both go through identical upsert logic.
 */
export async function upsertBeers(beers: Omit<Beer, 'favorite' | 'status'>[]): Promise<void> {
  const db = await getDb();
  for (const b of beers) {
    const status = statusFromFlags(b.glutenFree);
    await db.runAsync(
      `INSERT INTO beers (id, name, brewery, style, abv, ibu, status, ppm, glutenFree, glutenRemoved, discontinued, country, grains, note, breweryUrl, favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         brewery = excluded.brewery,
         style = excluded.style,
         abv = excluded.abv,
         ibu = excluded.ibu,
         status = excluded.status,
         ppm = excluded.ppm,
         glutenFree = excluded.glutenFree,
         glutenRemoved = excluded.glutenRemoved,
         discontinued = excluded.discontinued,
         country = excluded.country,
         grains = excluded.grains,
         note = excluded.note,
         breweryUrl = excluded.breweryUrl`,
      [
        b.id,
        b.name,
        b.brewery,
        b.style,
        b.abv,
        b.ibu,
        status,
        b.ppm,
        b.glutenFree ? 1 : 0,
        b.glutenRemoved ? 1 : 0,
        b.discontinued ? 1 : 0,
        b.country,
        JSON.stringify(b.grains),
        b.note,
        b.breweryUrl,
      ]
    );
  }

  if (beers.length > 0) {
    const placeholders = beers.map(() => '?').join(', ');
    await db.runAsync(
      `DELETE FROM beers WHERE id NOT IN (${placeholders})`,
      beers.map((b) => b.id)
    );
  }
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`CREATE TABLE IF NOT EXISTS beers (${TABLE_COLUMNS_DDL});`);
  await migrateSchema(db);

  // Re-run on every launch so dataset edits (data/beers.json) show up without
  // a reinstall.
  await upsertBeers(beersSeed as Omit<Beer, 'favorite' | 'status'>[]);
}

/** Pure helper (no db access) so it's testable head-on: builds the WHERE clause + params for listBeers. */
export function buildSearchClause(
  filter: FilterKey,
  query: string
): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter === 'favorite') {
    clauses.push('favorite = 1');
  } else if (filter !== 'all') {
    clauses.push('status = ?');
    params.push(filter);
  }
  const q = query.trim();
  if (q) {
    clauses.push('(name LIKE ? OR brewery LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listBeers(
  filter: FilterKey = 'all',
  query = ''
): Promise<Beer[]> {
  const db = await getDb();
  const { where, params } = buildSearchClause(filter, query);
  const rows = await db.getAllAsync<BeerRow>(
    `SELECT * FROM beers ${where} ORDER BY name ASC`,
    params
  );
  return rows.map(rowToBeer);
}

export async function getBeerById(id: number): Promise<Beer | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BeerRow>('SELECT * FROM beers WHERE id = ?', [id]);
  return row ? rowToBeer(row) : null;
}

export async function toggleFavorite(id: number): Promise<boolean> {
  const db = await getDb();
  await db.runAsync('UPDATE beers SET favorite = 1 - favorite WHERE id = ?', [id]);
  const row = await db.getFirstAsync<{ favorite: number }>(
    'SELECT favorite FROM beers WHERE id = ?',
    [id]
  );
  return !!row?.favorite;
}
