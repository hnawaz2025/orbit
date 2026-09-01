import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Postgres connection errors that mean "the server was asleep", not "the query
 * was wrong".
 *
 * Neon's free tier suspends a database that has been idle for a few minutes.
 * The first connection after that does not wait for the wake-up -- it fails
 * outright, and roughly a second later the same query succeeds. During the
 * conference that lands on whichever attendee happens to open Orbit first
 * after a quiet spell, and they see an error rather than a slow answer.
 *
 * P1001 is "can't reach database server", P1017 is "server has closed the
 * connection". Both are transient here. Everything else -- a constraint
 * violation, a missing column -- is a real bug and must not be retried into
 * looking like a slow success.
 */
const WAKE_UP_CODES = new Set(["P1001", "P1017"]);

/** Roughly six seconds of waiting in total, which covers a Neon resume. */
const RETRY_DELAYS_MS = [300, 900, 1800, 3000];

function isWakingUp(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && WAKE_UP_CODES.has(error.code)) ||
    error instanceof Prisma.PrismaClientInitializationError
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One client for the whole process. PrismaClient owns a connection pool, so
 * constructing it per-request or per-module would open pools that never get
 * reused and eventually exhaust Postgres's connection limit.
 *
 * Every query is wrapped in a retry for the sleeping-database case above. This
 * is deliberately at the client rather than at each call site: the failure can
 * surface on any query, and a helper that has to be remembered is a helper
 * that will be forgotten on the one route that matters.
 */
export const prisma = new PrismaClient().$extends({
  query: {
    async $allOperations({ args, query, operation, model }) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          return await query(args);
        } catch (error) {
          if (!isWakingUp(error)) throw error;
          lastError = error;
          if (attempt < RETRY_DELAYS_MS.length) {
            // Logged because a retry that never surfaces turns a database
            // that is always asleep into unexplained latency.
            console.warn(
              `db: ${model ?? "raw"}.${operation} hit a sleeping database, retry ${attempt + 1}`
            );
            await sleep(RETRY_DELAYS_MS[attempt]);
          }
        }
      }
      throw lastError;
    },
  },
}) as unknown as PrismaClient;
