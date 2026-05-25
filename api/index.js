/**
 * Monorepo-root API entry when Vercel Root Directory is the repo root.
 */
import app from "./serverless.mjs";

export const runtime = "nodejs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 3008,
};
