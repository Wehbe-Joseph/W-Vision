/**
 * Vercel serverless entry — no top-level await (avoids cold-start loader failures).
 * Boot side-effects run on first import; storage bucket setup is best-effort.
 */
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureTourImagesBucket } from "./lib/imageStorage.js";

ensureTourImagesBucket().catch((err) => {
  logger.warn(
    { err },
    "Could not ensure tour-images bucket on boot — uploads may fail until this is resolved.",
  );
});

logger.info("API serverless bundle ready");

export default app;
