// Vercel serverless entry — routes /api/* to the Express app (see root vercel.json rewrites).
// Built by `pnpm --filter @workspace/api-server build` during the Vercel build step.
// @ts-expect-error — prebuilt ESM bundle, generated at deploy time
import app from "../artifacts/api-server/dist/serverless.mjs";

export default app;

export const config = {
  maxDuration: 60,
  memory: 1024,
};
