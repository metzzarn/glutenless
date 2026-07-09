// Manual mock: a tiny in-memory stand-in for the exact subset of expo-sqlite's
// API that lib/db.ts calls, since the real native module can't run under Jest.
type Row = Record<string, unknown>;
type ColumnInfo = { notnull: boolean };

function stripLike(param: string): string {
  return param.replace(/^%/, '').replace(/%$/, '').toLowerCase();
}

function extractInsertColumns(sql: string): string[] {
  const match = sql.match(/INSERT INTO \w+ \(([^)]+)\)/);
  return match ? match[1].split(',').map((s) => s.trim()) : [];
}

function parseColumnDefs(sql: string): Map<string, ColumnInfo> {
  const cols = new Map<string, ColumnInfo>();
  const body = sql.match(/\(([\s\S]+)\)/)?.[1] ?? '';
  for (const part of body.split(',')) {
    const m = part.trim().match(/^(\w+)\s+(?:INTEGER|TEXT|REAL)\b/);
    if (!m) continue;
    cols.set(m[1], { notnull: /NOT NULL/.test(part) });
  }
  return cols;
}

class FakeDatabase {
  rows: Row[] = [];
  columns: Map<string, ColumnInfo> = new Map();
  private pending: { rows: Row[]; columns: Map<string, ColumnInfo> } | null = null;

  async execAsync(sql: string) {
    if (sql.includes('CREATE TABLE beers_new')) {
      this.pending = { rows: [], columns: parseColumnDefs(sql) };
    } else if (sql.includes('CREATE TABLE')) {
      // Only fresh (never-seen) fake DBs start empty, mirroring CREATE TABLE IF
      // NOT EXISTS being a no-op against a table that's already there.
      if (this.columns.size === 0) this.columns = parseColumnDefs(sql);
    } else if (sql.includes('INSERT INTO beers_new') && sql.includes('SELECT')) {
      const cols = extractInsertColumns(sql);
      if (this.pending) {
        this.pending.rows = this.rows.map((r) => {
          const copy: Row = {};
          for (const c of cols) copy[c] = r[c];
          return copy;
        });
      }
    } else if (sql.includes('DROP TABLE beers')) {
      // no-op: the rename step below is what actually swaps the table in
    } else if (sql.includes('ALTER TABLE beers_new RENAME TO beers')) {
      if (this.pending) {
        this.rows = this.pending.rows;
        this.columns = this.pending.columns;
        this.pending = null;
      }
    } else if (sql.includes('ALTER TABLE beers ADD COLUMN')) {
      const match = sql.match(/ADD COLUMN (\w+)/);
      if (match) this.columns.set(match[1], { notnull: /NOT NULL/.test(sql) });
    }
  }

  async runAsync(sql: string, params: unknown[] = []) {
    if (sql.includes('INSERT INTO beers')) {
      // Mirrors real SQLite refusing to write a column the table doesn't have.
      const missing = extractInsertColumns(sql).find((c) => !this.columns.has(c));
      if (missing) throw new Error(`table beers has no column named ${missing}`);

      const [
        id,
        name,
        brewery,
        style,
        abv,
        ibu,
        status,
        ppm,
        glutenFree,
        glutenRemoved,
        discontinued,
        country,
        grains,
        note,
      ] = params;
      const fields = {
        name,
        brewery,
        style,
        abv,
        ibu,
        status,
        ppm,
        glutenFree,
        glutenRemoved,
        discontinued,
        country,
        grains,
        note,
      };
      const existing = this.rows.find((r) => r.id === id);
      if (existing && sql.includes('ON CONFLICT')) {
        Object.assign(existing, fields);
      } else if (!existing) {
        this.rows.push({ id, ...fields, favorite: 0 });
      }
    } else if (sql.includes('UPDATE beers SET favorite')) {
      const [id] = params;
      const row = this.rows.find((r) => r.id === id);
      if (row) row.favorite = row.favorite ? 0 : 1;
    } else if (sql.includes('DELETE FROM beers WHERE id NOT IN')) {
      const keepIds = new Set(params);
      this.rows = this.rows.filter((r) => keepIds.has(r.id));
    }
    return { lastInsertRowId: 0, changes: 1 };
  }

  async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (sql.includes('COUNT(*)')) {
      return { count: this.rows.length } as unknown as T;
    }
    if (sql.includes('SELECT favorite FROM beers')) {
      const [id] = params;
      const row = this.rows.find((r) => r.id === id);
      return (row ? { favorite: row.favorite } : null) as T | null;
    }
    if (sql.includes('SELECT * FROM beers WHERE id')) {
      const [id] = params;
      return (this.rows.find((r) => r.id === id) ?? null) as T | null;
    }
    return null;
  }

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes('PRAGMA table_info')) {
      return [...this.columns.entries()].map(([name, info]) => ({
        name,
        notnull: info.notnull ? 1 : 0,
      })) as unknown as T[];
    }

    let remaining = [...params];
    let result = [...this.rows];

    if (sql.includes('favorite = 1')) {
      result = result.filter((r) => r.favorite === 1);
    }
    if (sql.includes('status = ?')) {
      const [status, ...rest] = remaining;
      remaining = rest;
      result = result.filter((r) => r.status === status);
    }
    if (sql.includes('name LIKE ? OR brewery LIKE ?')) {
      const [likeName, likeBrewery, ...rest] = remaining;
      remaining = rest;
      const q = stripLike(String(likeName ?? likeBrewery));
      result = result.filter(
        (r) =>
          String(r.name).toLowerCase().includes(q) ||
          String(r.brewery).toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return result as unknown as T[];
  }
}

const dbs = new Map<string, FakeDatabase>();

export async function openDatabaseAsync(name: string) {
  if (!dbs.has(name)) dbs.set(name, new FakeDatabase());
  return dbs.get(name)!;
}
