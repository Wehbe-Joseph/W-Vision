import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// On Vercel, env vars come from the project settings — not a local .env file.
if (process.env.VERCEL !== "1") {
  const apiServerRoot = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(apiServerRoot, "..", ".env") });
  dotenv.config({ path: path.join(apiServerRoot, "..", ".env.local") });
}

const { default: app } = await import("./app.js");
const { logger } = await import("./lib/logger.js");
const { ensureTourImagesBucket } = await import("./lib/imageStorage.js");

// Same boot hooks as index.ts, without app.listen() (serverless).
ensureTourImagesBucket().catch((err) => {
  logger.warn(
    { err },
    "Could not ensure tour-images bucket on boot — uploads may fail until this is resolved.",
  );
});

logger.info("API serverless bundle ready");

export default app;
