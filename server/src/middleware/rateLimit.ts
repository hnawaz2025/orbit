import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import type { DeviceRequest } from "./device";

// Why this exists: POST /ask is not a read. One call runs a facet-extraction
// model pass, an embedding, and a generated explanation for every result --
// call it a handful of billed requests per question. A loop against it is a
// real bill, and the endpoint is necessarily unauthenticated because the whole
// product is "open it in a hallway and ask something".
//
// Keying prefers the device token and falls back to the caller's IP. The token
// is spoofable, but rotating it only buys a fresh bucket until the IP limit
// underneath catches up -- which is the layer that actually bounds spend.

// A conference attendee asking questions between sessions realistically makes
// a few per quarter hour. This allows roughly a dozen, which no real person
// reaches by accident and which stops a runaway client quickly.
const AI_LIMIT_PER_WINDOW = 40;
const AI_WINDOW_MS = 15 * 60 * 1000;

// Reads are cheap but still hit Postgres. Sized so pull-to-refresh and
// re-opening the app never trip it.
const READ_LIMIT_PER_WINDOW = 600;
const READ_WINDOW_MS = 15 * 60 * 1000;

// ipKeyGenerator is required rather than raw req.ip: it normalises IPv6 to a
// subnet, so one client cannot walk a /64 for a fresh bucket each request.
function deviceOrIpKey(req: Request): string {
  const deviceId = (req as DeviceRequest).deviceId;
  if (deviceId) return `device:${deviceId}`;
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

// One shape for every limit response so the client can branch on a code
// instead of matching on prose, and so a 429 never looks like a crash.
function limitResponse(message: string) {
  return {
    error: message,
    code: "RATE_LIMITED" as const,
  };
}

export const aiRateLimiter = rateLimit({
  windowMs: AI_WINDOW_MS,
  limit: AI_LIMIT_PER_WINDOW,
  keyGenerator: deviceOrIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limitResponse(
    "That's a lot of questions in a short time. Give it a few minutes and ask again."
  ),
});

export const readRateLimiter = rateLimit({
  windowMs: READ_WINDOW_MS,
  limit: READ_LIMIT_PER_WINDOW,
  keyGenerator: deviceOrIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limitResponse("Too many requests. Try again in a few minutes."),
});
