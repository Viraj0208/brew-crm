import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy init: importing this module must NOT require DATABASE_URL — pure domain
// modules (stateMachine, funnel, outbox backoff) import sibling files that
// transitively pull this in, and their unit tests run without a DB. The
// connection is only established on first actual query.
type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __brewPool?: Pool; __brewDb?: Db };

function getDb(): Db {
  if (globalForDb.__brewDb) return globalForDb.__brewDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  // node-postgres works for both a local Docker Postgres and Neon's POOLED
  // connection string on the Vercel Node runtime (TCP is available there). Neon
  // requires SSL; localhost does not.
  const isLocal = /(^|@)(localhost|127\.0\.0\.1)/.test(connectionString);
  const pool =
    globalForDb.__brewPool ??
    new Pool({
      connectionString,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  if (!globalForDb.__brewPool) globalForDb.__brewPool = pool;

  const instance = drizzle(pool, { schema });
  globalForDb.__brewDb = instance;
  return instance;
}

// Proxy so existing `db.select(...)` call sites are unchanged; the real handle
// is built on the first property access, not at import time.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Db;

export { schema };
