/**
 * Vercel API entry — all /api/* traffic is rewritten here (see vercel.json).
 */
import app from "./serverless.mjs";

export const runtime = "nodejs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 3008,
};
