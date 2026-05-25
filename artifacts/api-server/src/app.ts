import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

// Vercel invokes `api/[...path].js` with paths like `/healthz`, not `/api/healthz`.
// Our routers are mounted under `/api`, so normalize before routing.
if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
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
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(authMiddleware);

// All REST handlers live under `/api` (see `routes/index.ts`).
app.use("/api", router);

export default app;
