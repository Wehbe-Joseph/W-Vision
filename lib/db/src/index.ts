import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const allowNoDb =
  process.env.ALLOW_NO_DB === "true" || process.env.NODE_ENV !== "production";

function createNoDbProxy() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Database is disabled. Set DATABASE_URL to enable API data routes.",
        );
      },
    },
  );
}

// Supabase's pooler serves a TLS chain signed by an internal CA that Node
// doesn't trust by default. We pass `ssl: { rejectUnauthorized: false }` to
// skip cert validation, but `pg` internally re-parses the connection string
// and `sslmode=require` overrides our ssl option with a strict-validation
// config. Strip sslmode from the URL so our explicit `ssl` setting wins.
const sanitizedUrl = databaseUrl
  ? databaseUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
  : null;

export const pool = sanitizedUrl
  ? new Pool({
      connectionString: sanitizedUrl,
      ssl: { rejectUnauthorized: false },
    })
  : null;

export const db = databaseUrl
  ? drizzle(pool, { schema })
  : allowNoDb
    ? (createNoDbProxy() as ReturnType<typeof drizzle<typeof schema>>)
    : (() => {
        throw new Error(
          "DATABASE_URL must be set. Did you forget to provision a database?",
        );
      })();

export * from "./schema";
