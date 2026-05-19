import "dotenv/config";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureTourImagesBucket } from "./lib/imageStorage.js";
import {
  ensureToursSpzBucket,
  isSplatStorageConfigured,
} from "./lib/supabaseSpzMirror.js";

// Same boot hooks as index.ts, without app.listen() (serverless).
ensureTourImagesBucket().catch((err) => {
  logger.warn(
    { err },
    "Could not ensure tour-images bucket on boot — uploads may fail until this is resolved.",
  );
});

ensureToursSpzBucket().catch((err) => {
  logger.warn(
    { err },
    "Could not ensure tours (.spz) bucket on boot — splat mirroring may fail until this is resolved.",
  );
});

logger.info(
  {
    worldLabsEnabled: process.env.WORLD_LABS_ENABLED !== "false",
    splatStorageConfigured: isSplatStorageConfigured(),
  },
  "API serverless bundle ready",
);

export default app;
