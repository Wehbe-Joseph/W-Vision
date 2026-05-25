/**
 * Vercel catch-all for /api/* (healthz, generate-tour, tours, …).
 * Lazy-loads the Express app so boot errors return JSON instead of FUNCTION_INVOCATION_FAILED.
 */
let expressApp;

export default async function handler(req, res) {
  try {
    if (!expressApp) {
      const mod = await import("./serverless.mjs");
      expressApp = mod.default;
      if (typeof expressApp !== "function") {
        throw new Error("serverless.mjs did not export an Express app");
      }
    }
    return expressApp(req, res);
  } catch (err) {
    console.error("[wvision-api] boot/handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "API failed to start",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}

export const config = {
  maxDuration: 300,
  memory: 3008,
};
