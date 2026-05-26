import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { stripeWebhookHandler } from "./routes/billing.js";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

// Vercel invokes the function with paths like `/healthz`, not `/api/healthz`.
// Our routers are mounted under `/api`, so normalize before routing.
if (isVercel) {
  app.use((req, _res, next) => {
    const raw = req.url ?? "/";
    const qIndex = raw.indexOf("?");
    const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
    const qs = qIndex === -1 ? "" : raw.slice(qIndex);
    if (!path.startsWith("/api")) {
      req.url = `${path === "/" ? "/api" : `/api${path.startsWith("/") ? path : `/${path}`}`}${qs}`;
    }
    next();
  });
}

if (isVercel) {
  // pino-http worker threads break on Vercel serverless — attach logger directly.
  app.use((req, _res, next) => {
    (req as Request & { log?: typeof logger }).log = logger;
    next();
  });
} else {
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
}
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

// Stripe webhooks require the raw body for signature verification.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(authMiddleware);

// All REST handlers live under `/api` (see `routes/index.ts`).
app.use("/api", router);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
});

export default app;
