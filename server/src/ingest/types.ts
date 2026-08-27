import type { EntityKind } from "@prisma/client";

// Ingestion is deliberately pluggable, in three tiers. All of them emit the
// same ExtractedEntity shape, and nothing downstream ever learns which tier
// produced a row -- that separation is what stops "support a new conference"
// from meaning "write a new scraper".
//
//   Tier 1  Platform adapters. Most tech conferences run their schedule on
//           Sessionize, pretalx, Sched, Swapcard or Cvent rather than hand-
//           rolling one. Where a platform exposes per-event JSON, reading it
//           is both more reliable and cheaper than rendering a page. A new
//           event on a supported platform costs an event id.
//
//   Tier 2  The generic extractor (adapters/generic.ts). Renders any public
//           page and has a model pull entities out of the text. Lower
//           confidence than Tier 1, but it works on a site nobody has seen
//           before, which is the whole point: onboarding a new event costs a
//           URL, not an engineering sprint.
//
//   Tier 3  Organizer-supplied. Once an organizer is a customer they hand
//           over a CSV or API access, and this stops being a scraping problem
//           at all. Tiers 1 and 2 exist to make Tier 3 sales possible -- you
//           show an organizer their own conference already working before
//           asking them for anything.

export interface IngestSource {
  /** Which Event these entities belong to. */
  eventSlug: string;
  url: string;
  /**
   * What this page is, in a few words ("the exhibitor list", "speaker bios").
   * Cheap to supply and it measurably improves Tier 2 extraction, because
   * "this is a list of sponsor booths" resolves ambiguity that page text alone
   * often leaves open.
   */
  hint?: string;
}

/**
 * An entity as it comes out of ingestion: no id, no embedding, and carrying a
 * confidence score that decides whether it is allowed into the corpus at all.
 *
 * Relationships are expressed by *name* rather than id, because an extractor
 * reading one page has no idea what a speaker's database id is -- persist.ts
 * resolves them once every entity for the event exists.
 */
export interface ExtractedEntity {
  kind: EntityKind;

  /** Talk title, person's name, company name. Never empty. */
  title: string;
  /** One line of context: "Staff Engineer @ Snowflake", a booth tagline. */
  subtitle?: string;
  /** Abstract, bio, or product blurb. The primary text we later embed. */
  description?: string;

  /** Room name or booth number, exactly as printed in the program. */
  locationName?: string;
  /** ISO 8601. Absent for entities that aren't time-bound, e.g. a booth. */
  startsAt?: string;
  endsAt?: string;

  /**
   * The conference's own audience label ("Beginner", "Advanced", "101").
   * Used only to filter *for* the attendee and to explain what was filtered --
   * never to editorialise about a session. See the note in match/filter.ts.
   */
  level?: string;

  /** True when the content outlives the event (a recorded talk). */
  isDurable?: boolean;

  tags: string[];

  /**
   * 0..1, the extractor's own confidence that this entity is real and correctly
   * parsed. Rows below INGEST_CONFIDENCE_FLOOR are dropped rather than guessed
   * at: a plausible-looking hallucinated session is far more damaging than a
   * missing one, because it sends a real person to a room that doesn't exist.
   */
  confidence: number;

  /** The page this came from. Every fact in the corpus stays traceable. */
  sourceUrl: string;

  /** Resolved into EntityLink rows by name once the event is fully ingested. */
  speakerNames?: string[];
  orgName?: string;
}

export interface IngestAdapter {
  readonly name: string;
  /** Whether this adapter can handle the source; checked highest-tier first. */
  supports(source: IngestSource): boolean;
  collect(source: IngestSource): Promise<ExtractedEntity[]>;
}

/**
 * Below this, an extracted row is discarded. Tuned to be strict: the corpus is
 * only a few hundred rows and a thin one degrades the product gracefully,
 * whereas one fabricated room number destroys trust in everything else on the
 * screen the moment an attendee walks to it.
 */
export const INGEST_CONFIDENCE_FLOOR = 0.6;
