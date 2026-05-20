// Vercel serverless entry (Root Directory = artifacts/tourvision).
// `serverless.mjs` is copied here during the Vercel build step.
// @ts-expect-error — prebuilt ESM bundle, generated at deploy time
import app from "./serverless.mjs";

export default app;

export const config = {
  maxDuration: 60,
  memory: 1024,
};
