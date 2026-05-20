import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isWorldLabsEnabled } from "../lib/worldlabs";

const router: IRouter = Router();

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function integrationStatus() {
  const publicApiBase = (process.env.PUBLIC_API_BASE_URL ?? "").trim();
  const publicApiLooksLocal =
    !publicApiBase ||
    /localhost|127\.0\.0\.1|:8080\b/i.test(publicApiBase);

  return {
    apify: {
      configured: envPresent("APIFY_TOKEN"),
    },
    gemini: {
      configured: envPresent("GEMINI_API_KEY"),
    },
    worldLabs: {
      configured: envPresent("WORLD_LABS_API_KEY"),
      enabled: isWorldLabsEnabled(),
    },
    database: {
      configured: envPresent("DATABASE_URL"),
    },
    supabase: {
      configured:
        envPresent("SUPABASE_URL") &&
        envPresent("SUPABASE_ANON_KEY") &&
        envPresent("SUPABASE_SERVICE_ROLE_KEY"),
    },
    publicApiBaseUrl: {
      configured: !publicApiLooksLocal,
      value: publicApiLooksLocal ? null : publicApiBase.replace(/\/+$/, ""),
    },
  };
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Shows which third-party integrations are configured (no secrets). */
router.get("/healthz/integrations", (_req, res) => {
  const integrations = integrationStatus();
  const ready =
    integrations.apify.configured &&
    integrations.gemini.configured &&
    integrations.worldLabs.configured &&
    integrations.database.configured &&
    integrations.supabase.configured &&
    integrations.publicApiBaseUrl.configured;

  res.json({
    status: ready ? "ok" : "degraded",
    vercel: process.env.VERCEL === "1",
    integrations,
  });
});

export default router;
