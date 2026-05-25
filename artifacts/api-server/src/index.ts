import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const apiServerRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(apiServerRoot, "..", ".env") });
dotenv.config({ path: path.join(apiServerRoot, "..", ".env.local") });

// Dynamic imports so dotenv runs before app/supabase modules initialize.
const { default: app } = await import("./app.js");
const { logger } = await import("./lib/logger.js");
const { getSupabaseAuth, getSupabaseAdmin } = await import("./lib/supabaseAdmin.js");
const { ensureTourImagesBucket } = await import("./lib/imageStorage.js");
const { sweepExpiredTours } = await import("./lib/tourMemoryStore.js");

if (!getSupabaseAuth()) {
  logger.warn(
    "Supabase auth client not configured (SUPABASE_URL + SUPABASE_ANON_KEY). Protected routes will return 401.",
  );
} else if (!getSupabaseAdmin()) {
  logger.warn(
    "Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY). Image uploads may fail.",
  );
}

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureTourImagesBucket().catch((err) => {
  logger.warn(
    { err },
    "Could not ensure tour-images bucket on boot — uploads may fail until this is resolved.",
  );
});

// Periodically freeze free-tier tours that have passed their 24h TTL.
setInterval(() => {
  const froze = sweepExpiredTours();
  if (froze > 0) {
    logger.info({ froze }, "Froze expired free-tier tours");
  }
}, 60_000).unref();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
