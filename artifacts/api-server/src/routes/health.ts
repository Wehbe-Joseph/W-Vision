import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import {
  getConfiguredPublicApiBaseForDiagnostics,
  isPublicApiBaseConfigured,
} from "../lib/resolvePublicApiBaseUrl";

const router: IRouter = Router();

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function integrationStatus() {
  return {
    apify: {
      configured: envPresent("APIFY_TOKEN"),
    },
    gemini: {
      configured: envPresent("GEMINI_API_KEY"),
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
      configured: isPublicApiBaseConfigured(),
      value: getConfiguredPublicApiBaseForDiagnostics(),
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
