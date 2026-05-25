import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const apiServerRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(apiServerRoot, "..", ".env") });
dotenv.config({ path: path.join(apiServerRoot, "..", ".env.local") });
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureTourImagesBucket } from "./lib/imageStorage.js";

// Same boot hooks as index.ts, without app.listen() (serverless).
ensureTourImagesBucket().catch((err) => {
  logger.warn(
    { err },
    "Could not ensure tour-images bucket on boot — uploads may fail until this is resolved.",
  );
});

logger.info("API serverless bundle ready");

export default app;
