/**
 * Vercel catch-all for every /api/* route (healthz, generate-tour, tours, …).
 * `api/index.js` only handles /api exactly — this file is required for subpaths.
 */
import app from "./serverless.mjs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 3008,
};
