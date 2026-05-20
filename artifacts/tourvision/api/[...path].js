// Catch-all for /api/* — scrape-listing, generate-tour, healthz, etc.
// `serverless.mjs` is copied here during the Vercel build step.
import app from "./serverless.mjs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 1024,
};
