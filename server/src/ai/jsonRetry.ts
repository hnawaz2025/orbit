import type { z } from "zod";

// Shared across every LLM call: no provider guarantees well-formed JSON from a
// prompt alone. This extracts the first JSON object from raw text, validates it
// against the given schema, and retries once with an explicit correction
// instruction before giving up.
//
// Load-bearing in two places here. Ingestion runs untrusted page text through a
// model and writes the result to the database, so a malformed extraction that
// slipped through would corrupt the corpus permanently. And the recommendation
// call must return a fixed shape or the client has nothing to render.

// Distinguishes "the model answered badly" from "there was no answer". The
// OpenAI SDK (which every provider here speaks) attaches a numeric `status` to
// anything that came back from the wire, and an APIConnectionError for failures
// that never got that far -- neither of which a reworded prompt can fix.
function isTransportError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; name?: unknown };
  if (typeof candidate.status === "number") return true;
  return typeof candidate.name === "string" && /^API(Connection|UserAbort)/.test(candidate.name);
}

// Built per-attempt from the actual error rather than a fixed string, so a
// retry after a specific mistake (an out-of-range index, a missing field) has
// something to go on instead of repeating the same mistake.
function buildCorrectionNote(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Your previous response had this problem: ${detail}. Return ONLY a single valid JSON object that fixes this, with no prose before or after it, and no markdown code fences.`;
}

function extractJsonBlock(raw: string): string {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Expected JSON in model output, got: ${raw}`);
  return match[0];
}

/**
 * `validate` is for structural problems that would corrupt data if accepted --
 * mismatched array lengths, out-of-range indices, an entity citing a source URL
 * it was never given. Those retry and then fail the call.
 *
 * `softValidate` is for quality problems where a degraded answer still beats no
 * answer. Those retry too, but on the last attempt the result is accepted with
 * a warning rather than throwing.
 */
export async function callForJson<T>(
  // Input type is deliberately loose. A schema using `.default()` or
  // `.transform()` has an input type that differs from its output, and the
  // parsed value here always starts as unknown JSON anyway -- pinning both
  // sides to T would reject exactly the schemas that fill in missing fields,
  // which is most of the useful ones.
  schema: z.ZodType<T, z.ZodTypeDef, any>,
  callModel: (correctionNote?: string) => Promise<string>,
  validate?: (parsed: T) => void,
  softValidate?: (parsed: T) => void
): Promise<T> {
  let lastError: unknown;
  const lastAttempt = 1;

  for (let attempt = 0; attempt <= lastAttempt; attempt++) {
    const correctionNote = attempt === 0 ? undefined : buildCorrectionNote(lastError);
    try {
      const text = await callModel(correctionNote);
      const parsed = schema.parse(JSON.parse(extractJsonBlock(text)));
      validate?.(parsed);

      if (softValidate) {
        try {
          softValidate(parsed);
        } catch (error) {
          if (attempt < lastAttempt) throw error;
          console.warn(
            `Accepting AI response despite quality check: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      return parsed;
    } catch (error) {
      lastError = error;

      // This retry exists to correct a badly-shaped *response*. If the model
      // never produced one -- auth rejected, out of quota, model id wrong,
      // provider at capacity -- then re-asking with a note about JSON
      // formatting is asking the wrong question, and only doubles how long the
      // caller waits to be told it failed. The SDK has already retried the
      // transient ones with proper backoff by this point.
      if (isTransportError(error)) break;
    }
  }

  // `cause` matters: by the time this reaches errorHandler the original
  // provider error (a 503, a quota failure) is the only thing that can tell the
  // user something useful, and flattening it into a string here would throw
  // away the status code that classification depends on.
  throw new Error(
    `AI response did not match the expected shape after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    { cause: lastError }
  );
}
