import type { EntityKind } from "@prisma/client";
export type { EntityKind };

/**
 * An entity as the ranking pipeline sees it.
 *
 * Deliberately not a Prisma row. Filtering and ranking are the two pieces of
 * this system with real reasoning in them and no I/O, so they are written
 * against a plain shape that a test can construct in one line -- which is what
 * makes the perishability and reachability rules verifiable rather than
 * plausible.
 */
export interface Candidate {
  id: string;
  kind: EntityKind;
  title: string;

  startsAt: Date | null;
  endsAt: Date | null;
  locationName: string | null;

  /** The conference's own audience label, verbatim. Never one we assigned. */
  level: string | null;

  /** True when the content outlives the event -- a recorded or streamed talk. */
  isDurable: boolean;

  /** Cosine similarity against the query vector, 0..1. */
  similarity: number;

  /** Ids of entities this one is linked to (speaker, employer, booth). */
  linkedIds: string[];

  /** The conference's own tags, including its pass tiers. */
  tags: string[];
}

/** Normalised audience level. Null when the page did not print one. */
export type LevelBand = 1 | 2 | 3;

/**
 * Map a conference's free-text audience label onto a band.
 *
 * Conferences label levels in at least three incompatible dialects -- words
 * ("Beginner"), course numbering ("200-level"), and bare numbers ("101") -- and
 * API World's own pages mix them. Returning null for anything unrecognised is
 * the important behaviour: an unparsed label must never be guessed at, because
 * the consequence of guessing is filtering a session away from someone who
 * wanted it.
 */
export function normaliseLevel(label: string | null): LevelBand | null {
  if (!label) return null;
  const text = label.toLowerCase();

  if (/\b(beginner|intro|introductory|basic|101|100[- ]?level)\b/.test(text)) return 1;
  if (/\b(advanced|expert|deep[- ]dive|300[- ]?level|400[- ]?level)\b/.test(text)) return 3;
  if (/\b(intermediate|200[- ]?level)\b/.test(text)) return 2;

  return null;
}

/**
 * What kind of thing would answer the question, inferred from how someone
 * described what they want.
 *
 * The distinction is real and attendees state it plainly: "I need to understand
 * X" wants a session, "I want to find someone who has done X" wants a human,
 * "who sells X" wants a booth. Similarity alone cannot tell these apart,
 * because all three are about X -- which is why a question explicitly asking
 * for a person was returning five talks.
 *
 * Returns null when they did not say, which is most of the time. A preference
 * nobody expressed should not reorder anything.
 */
export function preferredKinds(seeking: string | null | undefined): EntityKind[] | null {
  if (!seeking) return null;
  const text = seeking.toLowerCase();

  if (/\b(person|people|someone|expert|practitioner|who has|talk to|meet|speaker|advice from|hire|job|recruit)\b/.test(text)) {
    return ["PERSON"];
  }

  if (/\b(vendor|supplier|product|tool|company|booth|buy|purchase|demo|sponsor)\b/.test(text)) {
    return ["BOOTH", "ORG"];
  }

  if (/\b(session|talk|workshop|learn|understand|technique|how to|introduction|overview)\b/.test(text)) {
    return ["TALK"];
  }

  return null;
}
