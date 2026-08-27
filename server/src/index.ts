// Entry point: validate config, build the app, mount routes, listen.
//
// Middleware order is load-bearing. readDevice runs before the limiters so they
// can key on the device token rather than collapsing every caller into one IP
// bucket, and errorHandler must stay last -- Express identifies the terminal
// error handler by its arity and its position.
import "dotenv/config";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { prisma } from "./db";
import { loadEnv } from "./env";
import { errorHandler } from "./middleware/errorHandler";
import { readDevice } from "./middleware/device";
import { readRateLimiter } from "./middleware/rateLimit";
import { eventsRouter } from "./routes/events";

const env = loadEnv();

const app = express();

// Render (and most PaaS) put a proxy in front of the app, so req.ip would
// otherwise be the proxy's address for every caller -- collapsing everyone into
// one rate-limit bucket. Trusting exactly one hop rather than `true` is
// deliberate: blanket trust lets a client forge X-Forwarded-For and pick its
// own bucket.
app.set("trust proxy", 1);

app.use(cors());
app.use(morgan("dev"));
// Voice recordings arrive as base64 JSON, which inflates size ~33% over the
// raw file and can exceed the default 2mb limit.
app.use(express.json({ limit: "15mb" }));
app.use(readDevice);

// Unlimited on purpose: an uptime check must never be rate-limited into
// looking like an outage.
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "connected" });
  } catch (error) {
    res.status(503).json({ ok: false, db: "unreachable", error: (error as Error).message });
  }
});

// Limiters are mounted per-router by how expensive the router is, not globally.
// /ask and /speech land here in P1 behind aiRateLimiter.
app.use("/events", readRateLimiter, eventsRouter);

app.use(errorHandler);

const port = env.PORT ? Number(env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Orbit server listening on port ${port}`);
});
