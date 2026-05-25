/**
 * Vercel catch-all for /api/* — filesystem route (no rewrite to /server).
 * Static import ensures api/serverless.mjs is packaged into this function.
 */
import app from "./serverless.mjs";

export const runtime = "nodejs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 3008,
};
