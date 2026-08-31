import { z } from "zod";
import { callForJson } from "../ai/jsonRetry";
import { complete } from "../ai/llm";

// Turning what someone said into what they meant.
//
// The reason this stage exists at all: two attendees with the identical problem
// describe it in vocabulary that shares no words. "Our checkout keeps falling
// over under load" and "I need to figure out horizontal scaling for a payments
// service" should reach the same sessions, and embedding the raw sentences
// alone does not reliably get there -- one is a symptom, the other is a
// solution shape.

const facetsSchema = z.object({
  /** What they are trying to achieve, in their own terms. */
  goal: z.string().nullish().transform((v) => v ?? undefined),
  /** Problem space: payments, observability, developer tooling. */
  domain: z.string().nullish().transform((v) => v ?? undefined),
  /** Named technologies, if any. */
  stack: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : v ?? []),
      z.array(z.string())
    ),
  /** What is actually in their way. Often the most matchable facet. */
  blocker: z.string().nullish().transform((v) => v ?? undefined),
  /**
   * What kind of help would land: an expert to talk to, a technique, a vendor,
   * a job. This is what lets ranking prefer a PERSON over a TALK when someone
   * says "I need to find someone who has done this".
   */
  seeking: z.string().nullish().transform((v) => v ?? undefined),

  /**
   * Whether this is a question a programme could answer at all.
   *
   * The organizer headline is "questions we had no answer for", and without
   * this it summed genuine gaps with "where is the coffee" -- not a programme
   * failure, and enough of them drown the ones that are. Three lines on a call
   * that already happens.
   */
  intent: z
    .enum(["programme", "logistics", "unclear"])
    .nullish()
    .transform((v) => v ?? "programme"),
});

export type QueryFacets = z.infer<typeof facetsSchema>;

const SYSTEM_PROMPT = `You read a conference attendee's description of their problem and restate it as structured facets.

You are interpreting, not answering. Never suggest a session, a person, or a solution.

- "goal" is what they are trying to achieve.
- "domain" is the problem space (payments, observability, developer tooling, ML infrastructure).
- "stack" lists technologies they explicitly named. Do not add technologies they did not mention.
- "blocker" is what is actually in their way, if they said.
- "seeking" is the kind of help that would land: "an expert to talk to", "a technique", "a vendor", "a job", "orientation".
- "intent" is one of:
    "programme"  - a subject a conference could put a session or a speaker against
    "logistics"  - the venue, times, wifi, food, parking, registration
    "unclear"    - too vague or too short to tell
  Judge the question itself, not whether this particular conference covers it.

Omit any field they did not give you enough to fill. A missing facet is fine; an invented one sends them to the wrong room.

Return ONLY a JSON object with those six keys. No prose, no markdown fences.`;

/**
 * Text used to embed the query.
 *
 * Built from the facets *plus* the original sentence rather than the facets
 * alone. The facets normalise vocabulary, but they also discard the specific
 * phrasing that sometimes carries the match -- a product name, an error
 * message, a turn of phrase that appears verbatim in an abstract. Keeping both
 * costs nothing and covers each other's failure mode.
 */
export function embeddingTextForQuery(rawText: string, facets: QueryFacets): string {
  const parts = [
    rawText,
    facets.goal,
    facets.domain,
    facets.blocker,
    facets.seeking,
    facets.stack.length > 0 ? facets.stack.join(", ") : null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.join("\n");
}

export async function extractFacets(rawText: string): Promise<QueryFacets> {
  return callForJson(facetsSchema, (correctionNote) =>
    complete({
      system: SYSTEM_PROMPT,
      user: rawText,
      correctionNote,
      // OpenAI, not the extraction model. This decides what the question
      // means, and a 7B answering "tell me people i want to meet from Google"
      // with {"stack": ["Google", "OpenAI"]} -- no goal, no seeking -- made
      // every stage downstream work from a misreading.
      provider: "openai",
      // Interpretation, not generation. Near-zero so the same question asked
      // twice reaches the same sessions.
      temperature: 0,
    })
  );
}
