// Contrato estrecho del runtime local Node >=26; @types/node del proyecto es 20.
// No habilita SQLite en el Worker ni reemplaza las dependencias de producción.
declare module 'node:sqlite' {
  export type SQLiteInputValue = null | number | bigint | string | Uint8Array;
  export type SQLiteOutputValue = null | number | bigint | string | Uint8Array;
  export interface StatementSync {
    all(...values: SQLiteInputValue[]): Record<string, SQLiteOutputValue>[];
    get(...values: SQLiteInputValue[]): Record<string, SQLiteOutputValue> | undefined;
    run(...values: SQLiteInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    readonly isTransaction: boolean;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
