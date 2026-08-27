import type { NextFunction, Request, Response } from "express";

export interface DeviceRequest extends Request {
  deviceId?: string;
}

/**
 * Reads the anonymous device token off the request. No account, no password,
 * no database lookup.
 *
 * Leena's equivalent middleware also minted and checked an opaque auth token,
 * because knowing someone's device id would otherwise have been enough to read
 * their practice history. Orbit deliberately does not copy that, and the reason
 * is worth stating: everything Orbit serves is a public conference programme.
 * There is no private corpus to protect, so an auth token would add an
 * onboarding step and a failure mode while defending nothing.
 *
 * What the device id is actually for is the rate limiter -- /ask spends money
 * on every call -- and, later, the organizer-facing aggregate of what attendees
 * needed. Both are fine with a spoofable identifier: the worst a rotated header
 * achieves is a fresh rate-limit bucket, which the IP-keyed fallback still
 * catches.
 *
 * If query history ever becomes private (a saved plan you can return to), that
 * is the point to add the token, not before.
 */
export function readDevice(req: DeviceRequest, _res: Response, next: NextFunction) {
  const deviceId = req.header("x-device-id");
  // Length-bounded before it reaches the limiter's key space, so a caller
  // cannot grow an unbounded in-memory map by sending huge headers.
  if (deviceId && deviceId.length <= 128) req.deviceId = deviceId;
  next();
}
