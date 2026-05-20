// Vercel Express entry (Root Directory = artifacts/tourvision).
// Built during deploy: api-server -> api/serverless.mjs
import app from "./api/serverless.mjs";

export default app;

export const config = {
  maxDuration: 300,
  memory: 1024,
};
