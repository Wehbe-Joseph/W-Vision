import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

type Db = NodePgDatabase<typeof schema>;

const allowNoDb =
  process.env.ALLOW_NO_DB === "true" || process.env.NODE_ENV !== "production";

function createNoDbProxy(): Db {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Database is disabled. Set DATABASE_URL to enable API data routes.",
        );
      },
    },
  ) as Db;
}

function missingDatabaseUrlError(): Error {
  return new Error(
    "DATABASE_URL is not set. Add it in Vercel → Project → Settings → Environment Variables (see artifacts/tourvision/.env.vercel.example), then redeploy.",
  );
}

// Supabase's pooler serves a TLS chain signed by an internal CA that Node
// doesn't trust by default. We pass `ssl: { rejectUnauthorized: false }` to
// skip cert validation, but `pg` internally re-parses the connection string
// and `sslmode=require` overrides our ssl option with a strict-validation
// config. Strip sslmode from the URL so our explicit `ssl` setting wins.
function sanitizeDatabaseUrl(databaseUrl: string): string {
  return databaseUrl
    .replace(/[?&]sslmode=[^&]*/g, "")
    .replace(/\?$/, "");
}

let poolInstance: InstanceType<typeof Pool> | null = null;
let dbInstance: Db | null = null;

function getPool(): InstanceType<typeof Pool> | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null;
  }
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: sanitizeDatabaseUrl(databaseUrl),
      ssl: { rejectUnauthorized: false },
    });
  }
  return poolInstance;
}

function getDbInstance(): Db {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    if (allowNoDb) {
      dbInstance = createNoDbProxy();
      return dbInstance;
    }
    throw missingDatabaseUrlError();
  }

  const pool = getPool();
  if (!pool) {
    throw missingDatabaseUrlError();
  }

  dbInstance = drizzle(pool, { schema });
  return dbInstance;
}

/** Lazy pool — never throws at module load. */
export const pool: InstanceType<typeof Pool> | null = new Proxy(
  {} as InstanceType<typeof Pool>,
  {
    get(_target, prop) {
      const real = getPool();
      if (!real) {
        throw missingDatabaseUrlError();
      }
      const value = (real as Record<string | symbol, unknown>)[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(real)
        : value;
    },
  },
) as InstanceType<typeof Pool>;

/** Lazy drizzle client — never throws at module load (fails on first query). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDbInstance();
    const value = (real as Record<string | symbol, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.trim().length > 0;
}

export * from "./schema";
