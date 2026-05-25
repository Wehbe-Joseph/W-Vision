/**
 * Monorepo-root API entry when Vercel Root Directory is the repo root.
 * `api/serverless.mjs` is copied here during vercel-build.
 */
import app from "./serverless.mjs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 3008,
};
