import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Pooled Neon connection — use the Neon pooler URL to dodge serverless
// connection-limit exhaustion (see ADR / §13).
const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
export { schema };
