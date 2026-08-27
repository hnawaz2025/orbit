import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, GENERIC_ERROR, classifyUpstreamError } from "../errors";

// Terminal error handler. Anything thrown/rejected in a route wrapped with
// asyncHandler ends up here instead of hanging the request or crashing the
// process. Keeping this last in the middleware chain is required by Express.
//
// Everything is logged in full here; only deliberately user-facing text is
// sent back. See ../errors.ts for the reasoning.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);

  // Our own validation of the client's request -- safe to return, and the
  // field-level detail is what makes a 400 actionable.
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.flatten(), code: "VALIDATION_ERROR" });
  }

  // Written for the user on purpose.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  const upstream = classifyUpstreamError(err);
  const { statusCode, code, message } = upstream ?? GENERIC_ERROR;
  res.status(statusCode).json({ error: message, code });
}
