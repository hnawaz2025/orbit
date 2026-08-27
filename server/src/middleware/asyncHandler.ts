import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not catch rejected promises from async route handlers, so an
// unhandled AI/DB error hangs the request instead of returning a response.
// Wrapping every handler in this forwards the rejection to the error
// middleware in index.ts.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
