import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const apiServerRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(apiServerRoot, "..", ".env") });
dotenv.config({ path: path.join(apiServerRoot, "..", ".env.local") });
import app from "./app";
import { logger } from "./lib/logger";
import { ensureTourImagesBucket } from "./lib/imageStorage";
import { sweepExpiredTours } from "./lib/tourMemoryStore";

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
