import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// node-postgres works for both a local Docker Postgres and Neon's POOLED connection string
// on the Vercel Node runtime (TCP is available there). Neon requires SSL; localhost does not.
const isLocal = /(^|@)(localhost|127\.0\.0\.1)/.test(connectionString);

// Reuse the pool across hot-reloads / serverless invocations in the same process.
const globalForDb = globalThis as unknown as { __brewPool?: Pool };
const pool =
  globalForDb.__brewPool ??
  new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
if (!globalForDb.__brewPool) globalForDb.__brewPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
