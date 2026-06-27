import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import redirectRouter from "./routes/redirect";
import territoryPagesRouter from "./routes/territoryPages";
import { stripeWebhookHandler } from "./routes/webhooks";
import { logger } from "./lib/logger";

const app: Express = express();

// We sit behind the Replit shared proxy, which sets X-Forwarded-For. Trusting
// the proxy makes req.ip the originating client IP (used when logging QR
// scans) instead of the loopback address Express otherwise reports.
app.set("trust proxy", true);

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
app.use(cors());
app.use(cookieParser());

// Stripe webhook MUST receive the raw request body so the signature in the
// `stripe-signature` header can be verified against the exact bytes Stripe
// signed. Mount this BEFORE express.json() — once JSON parsing runs, the raw
// body is gone and verification will fail with an opaque error.
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler,
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Public QR redirect lives at the app root (no /api prefix) so printed
// codes are short and human-readable. Mount BEFORE the /api router so it
// gets first crack at /go/:code.
app.use(redirectRouter);

// Territory manager HTML pages — served at canonical paths outside /api so
// links are human-readable. Mounts /admin/territories and /dealer/claim-territory.
app.use(territoryPagesRouter);

app.use("/api", router);

export default app;
