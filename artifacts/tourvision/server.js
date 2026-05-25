/**
 * Vercel Express entry — static import so the bundler includes api/serverless.mjs.
 * Rewrites in vercel.json send /api/* here.
 */
import app from "./api/serverless.mjs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 3008,
};
