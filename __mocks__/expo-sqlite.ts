// Manual mock: runs lib/db.ts's real SQL against a real SQLite engine
// (Node's built-in node:sqlite, in memory), since expo-sqlite's native module
// can't run under Jest. Only the async API lib/db.ts uses is adapted.
import { DatabaseSync } from 'node:sqlite';

type Params = (string | number | null)[];

class TestDatabase {
  constructor(readonly db: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: Params = []) {
    const { lastInsertRowid, changes } = this.db.prepare(sql).run(...params);
    return { lastInsertRowId: Number(lastInsertRowid), changes: Number(changes) };
  }

  async getFirstAsync<T>(sql: string, params: Params = []): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, params: Params = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
}

// One in-memory database per name, shared within a test file like the app's single connection.
const databases = new Map<string, TestDatabase>();

export async function openDatabaseAsync(name: string): Promise<TestDatabase> {
  let database = databases.get(name);
  if (!database) {
    database = new TestDatabase(new DatabaseSync(':memory:'));
    databases.set(name, database);
  }
  return database;
}

export type SQLiteDatabase = TestDatabase;
