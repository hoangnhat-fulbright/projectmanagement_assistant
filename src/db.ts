import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";

type Queryable = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

/**
 * Lớp bọc mỏng quanh database. Hiện chạy trên PGlite (Postgres trong tiến trình
 * Node, không cần cài server). SQL là SQL Postgres chuẩn, nên khi lên production
 * chỉ cần viết lại file này để trỏ sang một server Postgres thật.
 */
export type Db = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function wrap(q: Queryable, root: PGlite): Db {
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await q.query<T>(sql, params)).rows;
    },
    async one<T>(sql: string, params: unknown[] = []) {
      return (await q.query<T>(sql, params)).rows[0] ?? null;
    },
    tx<T>(fn: (tx: Db) => Promise<T>) {
      // Đang ở trong transaction rồi thì dùng luôn transaction đó.
      if (q !== root) return fn(db);
      return root.transaction((t) => fn(wrap(t, root)));
    },
    close: () => root.close(),
  };
  return db;
}

/** Mở database và áp schema. Không truyền `dataDir` thì chạy trong bộ nhớ (dùng cho test). */
export async function openDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  const pg = new PGlite(dataDir);
  const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await pg.exec(schema);
  return wrap(pg, pg);
}
