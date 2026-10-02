// Just the parts of Node's built-ins that the tests use. Declared here rather
// than adding @types/node, whose globals would also leak into the app's own
// type-checking.
declare module 'node:sqlite' {
  type Value = string | number | bigint | null | Uint8Array;

  class StatementSync {
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: Value[]): unknown;
    all(...params: Value[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: Uint8Array | string): { digest(encoding: 'hex'): string };
  };
}

declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}

declare const __dirname: string;
