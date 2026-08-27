import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AppError, classifyUpstreamError } from "./errors";

// The security-relevant half of this module is what it declines to classify:
// anything unrecognised must fall through to a generic 500 so provider
// internals, credentials and SQL never reach an attendee.

/** Shapes an error the way the OpenAI SDK does, with a numeric status. */
const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

describe("classifyUpstreamError", () => {
  test("recognises a provider capacity failure", () => {
    const result = classifyUpstreamError(
      apiError(503, "503 zai-org/GLM-4-9B-0414 is temporarily at capacity. Please try again shortly.")
    );
    assert.equal(result?.code, "AI_UNAVAILABLE");
    assert.equal(result?.statusCode, 503);
    // The model id must not survive into what the user reads.
    assert.ok(!result?.message.includes("GLM"));
  });

  test("sees through the wrapper callForJson adds", () => {
    // callForJson re-throws with context and attaches the original as cause.
    // Without walking the chain every provider failure would look generic.
    const original = apiError(503, "503 temporarily at capacity");
    const wrapped = new Error("AI response did not match the expected shape after retry: …", {
      cause: original,
    });
    assert.equal(classifyUpstreamError(wrapped)?.code, "AI_UNAVAILABLE");
  });

  test("distinguishes quota from ordinary rate limiting", () => {
    // Both arrive as 429. Quota will not clear on its own, so it gets its own
    // code even though the user-facing wording is similar.
    assert.equal(
      classifyUpstreamError(apiError(429, "429 You exceeded your current quota"))?.code,
      "AI_QUOTA_EXHAUSTED"
    );
    assert.equal(
      classifyUpstreamError(apiError(429, "429 Too many requests"))?.code,
      "AI_UNAVAILABLE"
    );
  });

  test("treats connection failures as timeouts", () => {
    assert.equal(classifyUpstreamError(new Error("Connection error."))?.code, "AI_TIMEOUT");
    assert.equal(classifyUpstreamError(apiError(504, "504 Gateway Timeout"))?.code, "AI_TIMEOUT");
  });

  describe("must NOT classify (falls through to a generic 500)", () => {
    test("a bad API key", () => {
      // Our misconfiguration, not something the user can act on, and the key
      // fragment in the message must never be echoed back.
      assert.equal(classifyUpstreamError(apiError(401, "401 Incorrect API key provided: sk-abc")), null);
    });

    test("a forbidden/gated model", () => {
      assert.equal(classifyUpstreamError(apiError(403, "403 This model is gated")), null);
    });

    test("a database error", () => {
      assert.equal(classifyUpstreamError(new Error('relation "public.Entity" does not exist')), null);
    });

    test("an ordinary bug", () => {
      assert.equal(
        classifyUpstreamError(new TypeError("Cannot read properties of undefined")),
        null
      );
    });

    test("junk values", () => {
      assert.equal(classifyUpstreamError(null), null);
      assert.equal(classifyUpstreamError(undefined), null);
      assert.equal(classifyUpstreamError("a string"), null);
    });
  });

  test("terminates on a self-referential cause chain", () => {
    const a: { cause?: unknown } & Error = new Error("a");
    a.cause = a;
    assert.doesNotThrow(() => classifyUpstreamError(a));
  });
});

describe("AppError", () => {
  test("defaults to a 400 that is safe to show", () => {
    const err = new AppError("Tell me a bit more about what you're working on.");
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, "APP_ERROR");
    assert.equal(err.message, "Tell me a bit more about what you're working on.");
  });

  test("carries an explicit status and code", () => {
    const err = new AppError('No event named "api-world-2026".', {
      statusCode: 404,
      code: "EVENT_NOT_FOUND",
    });
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, "EVENT_NOT_FOUND");
  });

  test("is a real Error, so instanceof in errorHandler holds", () => {
    assert.ok(new AppError("x") instanceof Error);
  });
});
