/**
 * Vercel API entry — dynamic import keeps serverless.mjs external (3.6MB bundle).
 * Rewrites send /api/* here (see vercel.json routes).
 */
let app;
let loadError;

async function loadApp() {
  if (loadError) throw loadError;
  if (!app) {
    try {
      const mod = await import("./serverless.mjs");
      app = mod.default;
      if (typeof app !== "function") {
        throw new Error("serverless.mjs did not export an Express app");
      }
    } catch (err) {
      loadError = err;
      throw err;
    }
  }
  return app;
}

export default async function handler(req, res) {
  try {
    const expressApp = await loadApp();
    return expressApp(req, res);
  } catch (err) {
    console.error("[wvision-api]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "API failed",
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
