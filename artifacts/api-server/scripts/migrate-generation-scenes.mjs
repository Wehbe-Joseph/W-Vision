// One-shot migration: add `generation_scenes jsonb` to `tours`.
// Safe to run multiple times.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Load .env manually so this script runs without installing dotenv into the
// api-server workspace.
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

// Reach into the pnpm store for pg since we don't depend on it directly.
const require = createRequire(import.meta.url);
const pg = require(
  "../../../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js",
);

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sanitized = url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

const pool = new Pool({
  connectionString: sanitized,
  ssl: { rejectUnauthorized: false },
});

const SQL = `ALTER TABLE tours ADD COLUMN IF NOT EXISTS generation_scenes jsonb;`;

try {
  console.log("Connecting…");
  const client = await pool.connect();
  try {
    console.log("Running:", SQL);
    await client.query(SQL);
    const check = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tours' AND column_name='generation_scenes'",
    );
    console.log("Verified column:", check.rows);
  } finally {
    client.release();
  }
  console.log("✅ Migration complete");
} catch (err) {
  console.error("❌ Migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
