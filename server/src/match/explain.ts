import { z } from "zod";
import { callForJson } from "../ai/jsonRetry";
import { complete } from "../ai/llm";
import type { QueryFacets } from "./facets";
import type { RankedCandidate } from "./rank";

// The sentence that makes this a product rather than a search box.
//
// Retrieval already decided *what* to show. This decides what to say about it,
// and it is the only part of the response a person actually reads closely --
// a ranked list without reasons asks the attendee to re-derive the relevance
// we already computed.

const explanationsSchema = z.object({
  reasons: z.array(
    z.object({
      /** Index into the candidate list, so an omission cannot shift the rest. */
      index: z.number().int().min(0),
      reason: z.string().min(1),
    })
  ),
});

const SYSTEM_PROMPT = `You write one line per recommendation explaining why it is worth this specific person's time.

You are given someone's stated problem and a numbered list of things at a conference: sessions, people, and booths.

For each one, write a single sentence, addressed to them, connecting the item to their problem. Be concrete about the connection.

Rules:
- Use only what is in the item's own description. Never claim a session covers something the text does not say it covers.
- Never attribute a session to a person unless that person is listed on that item as its speaker. Names shown on one item belong to that item alone. Attributing a talk to the wrong speaker is the worst mistake you can make here, because the attendee will repeat it to that person.
- Never invent a room, a time, a company, or a credential.
- Do not restate the title. They can read the title. Say why it matters to them.
- If the connection is weak, say what it does offer rather than overselling it. An honest "adjacent, but the speaker works on exactly your stack" is more useful than a confident irrelevance.
- One sentence each. No bullet points, no preamble.
- For a PERSON, write what to actually ask them.

Return ONLY a JSON object of the form {"reasons": [{"index": 0, "reason": "..."}, ...]}, one entry per item, using the index shown. No prose, no markdown fences.`;

export interface ExplainInput {
  rawText: string;
  facets: QueryFacets;
  candidates: RankedCandidate[];
  /** Descriptions, keyed by entity id. Kept out of Candidate to stay light. */
  descriptions: Map<string, string | null>;
  /**
   * Speaker names per entity id.
   *
   * Passed in because omitting them was actively harmful rather than merely
   * incomplete: with several items in one prompt and no speaker on any of them,
   * the model attached the first name it had seen to all of them, and confidently
   * credited three sessions to a speaker who had nothing to do with them.
   */
  speakers?: Map<string, string[]>;
}

/**
 * Generate a reason per candidate.
 *
 * All candidates go up in one call rather than one call each. Cost is the
 * smaller reason; the real one is that a model shown the whole set writes
 * reasons that differentiate -- given each card alone it produces five
 * variations of the same sentence, which is exactly what makes a
 * recommendation list feel machine-made.
 */
export async function explainRecommendations(input: ExplainInput): Promise<Map<string, string>> {
  const { rawText, facets, candidates, descriptions } = input;
  if (candidates.length === 0) return new Map();

  const itemLines = candidates.map((candidate, index) => {
    const description = descriptions.get(candidate.id);
    const named = input.speakers?.get(candidate.id) ?? [];
    return [
      `[${index}] ${candidate.kind}: ${candidate.title}`,
      named.length > 0 ? `    speakers: ${named.join(", ")}` : `    speakers: (none listed)`,
      description ? `    ${description.slice(0, 500)}` : null,
      candidate.locationName ? `    location: ${candidate.locationName}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const facetLines = [
    facets.goal ? `goal: ${facets.goal}` : null,
    facets.domain ? `domain: ${facets.domain}` : null,
    facets.blocker ? `blocker: ${facets.blocker}` : null,
    facets.seeking ? `seeking: ${facets.seeking}` : null,
    facets.stack.length > 0 ? `stack: ${facets.stack.join(", ")}` : null,
  ].filter(Boolean);

  const userPrompt = [
    "THEIR PROBLEM, IN THEIR WORDS:",
    rawText,
    "",
    ...(facetLines.length > 0 ? ["WHAT THEY SEEM TO NEED:", ...facetLines, ""] : []),
    "ITEMS:",
    ...itemLines,
  ].join("\n");

  const result = await callForJson(
    explanationsSchema,
    (correctionNote) =>
      complete({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        correctionNote,
        // A little warmth. This line is meant to be said out loud to a stranger
        // in a hallway, and at zero it reads like a form letter.
        temperature: 0.4,
      }),
    // Hard validation: an out-of-range index would attach a reason to the wrong
    // session, which is worse than having no reason at all -- it is a confident
    // statement about the wrong room.
    (parsed) => {
      for (const entry of parsed.reasons) {
        if (entry.index >= candidates.length) {
          throw new Error(
            `Reason references item ${entry.index}, but only ${candidates.length} items were given (valid indices 0-${candidates.length - 1}).`
          );
        }
      }
    },
    // Soft: a missing reason degrades one card, and losing the whole response
    // over it would be the worse trade.
    (parsed) => {
      if (parsed.reasons.length < candidates.length) {
        throw new Error(
          `Expected ${candidates.length} reasons, got ${parsed.reasons.length}. Write one for every item.`
        );
      }
    }
  );

  const byId = new Map<string, string>();
  for (const entry of result.reasons) {
    const candidate = candidates[entry.index];
    if (candidate) byId.set(candidate.id, entry.reason.trim());
  }
  return byId;
}
