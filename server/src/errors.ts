// Error taxonomy for anything that reaches a client.
//
// The rule: a message is only ever shown to the user if someone deliberately
// wrote it for them. Everything else gets logged in full server-side and
// replaced with something generic, because raw error text leaks provider
// internals, SQL fragments and file paths -- telling an attendee that
// "zai-org/GLM-4-9B-0414 is temporarily at capacity" is both alarming and
// useless to them.

/**
 * An error whose message was written for the user and is safe to return
 * verbatim. Anything thrown that is NOT an AppError is treated as internal.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options: { statusCode?: number; code?: string } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 400;
    this.code = options.code ?? "APP_ERROR";
  }
}

export interface ClientFacingError {
  statusCode: number;
  code: string;
  message: string;
}

// Errors get wrapped as they bubble (callForJson re-throws with context), so
// the useful signal is often on a `cause` several levels down. Walk the chain
// rather than inspecting only the outermost error.
function errorChain(error: unknown, depth = 0): unknown[] {
  if (depth > 5 || error === null || typeof error !== "object") return [error];
  return [error, ...errorChain((error as { cause?: unknown }).cause, depth + 1)];
}

function describe(error: unknown): { status?: number; text: string } {
  if (error === null || typeof error !== "object") return { text: String(error ?? "") };
  const candidate = error as { status?: unknown; message?: unknown };
  return {
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    text: typeof candidate.message === "string" ? candidate.message : "",
  };
}

/**
 * Recognise upstream AI/provider failures that the user can actually act on
 * ("busy, try again") and separate them from ones they can't ("our API key is
 * wrong"), which must stay generic so we don't leak configuration state.
 */
export function classifyUpstreamError(error: unknown): ClientFacingError | null {
  for (const link of errorChain(error)) {
    const { status, text } = describe(link);

    // Checked before the rate-limit branch below, not after: providers return
    // "out of quota" as a 429, so the broader status check would swallow it
    // and report a transient busy signal for something that will not clear on
    // its own. The user-facing message is nearly the same; the code is what
    // makes the difference visible in logs and alertable.
    if (/quota|insufficient_quota|billing|payment required/i.test(text) || status === 402) {
      return {
        statusCode: 503,
        code: "AI_QUOTA_EXHAUSTED",
        message: "Orbit is temporarily unavailable. Please try again later.",
      };
    }

    if (
      status === 429 ||
      status === 503 ||
      /capacity|overloaded|temporarily unavailable|rate.?limit|too many requests/i.test(text)
    ) {
      return {
        statusCode: 503,
        code: "AI_UNAVAILABLE",
        message: "Orbit is busy right now. Please try again in a moment.",
      };
    }

    if (
      status === 408 ||
      status === 504 ||
      /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|Connection error/i.test(text)
    ) {
      return {
        statusCode: 504,
        code: "AI_TIMEOUT",
        message: "That took too long to come back. Please try again.",
      };
    }

    // 401/403 from a provider means OUR credentials are wrong. Deliberately
    // falls through to the generic 500: it's our bug, not something the user
    // can respond to, and the detail belongs only in the logs.
  }

  return null;
}

export const GENERIC_ERROR: ClientFacingError = {
  statusCode: 500,
  code: "INTERNAL_ERROR",
  message: "Something went wrong on our end. Please try again.",
};

/**
 * Attach a cause without relying on the two-argument Error constructor.
 *
 * `new Error(message, { cause })` needs the ES2022 lib, and the build machine
 * resolved a narrower one than this machine does -- so the code compiled here
 * and failed there, which is the worst place to find out. Assigning the
 * property is equivalent at runtime on every Node this runs on, and depends on
 * no lib at all.
 *
 * The cause itself matters: by the time this reaches errorHandler the original
 * provider error -- a 503, a quota failure -- is the only thing that can tell
 * the user something useful, and flattening it into a string throws away the
 * status code that classification depends on.
 */
export function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}
