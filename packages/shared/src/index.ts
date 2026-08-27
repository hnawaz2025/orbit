// The DTO contract between the server and the client.
//
// Both workspaces import these types from the same file, so a field renamed on
// one side fails to compile on the other rather than showing up as `undefined`
// on a card at a conference. Nothing here is a Prisma type: the wire format is
// deliberately its own thing, because the corpus carries fields (embeddings,
// extractor confidence, source URLs) that the client has no business receiving.

export type EntityKind =
  | "TALK"
  | "PERSON"
  | "BOOTH"
  | "ORG"
  | "ROLE"
  | "PROJECT"
  | "TEAM";

export type LinkKind = "SPEAKS_AT" | "WORKS_FOR" | "STAFFS_BOOTH" | "SPONSORS";

/** Timestamps cross the wire as ISO 8601 strings, never as Date. */
export type IsoDateTime = string;

export interface EventSummary {
  slug: string;
  name: string;
  venue: string | null;
  timezone: string;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  entityCount: number;
}

/**
 * The other end of a match. A talk that matches surfaces its speaker, and that
 * speaker's booth -- which is the actionable half, since you cannot walk up to
 * a session but you can walk up to a person.
 */
export interface LinkedEntity {
  id: string;
  kind: EntityKind;
  title: string;
  subtitle: string | null;
  locationName: string | null;
  relation: LinkKind;
}

export interface RecommendedEntity {
  id: string;
  kind: EntityKind;
  title: string;
  subtitle: string | null;
  description: string | null;

  locationName: string | null;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;

  /** Rank position, 1-based. Ordering is the server's job, not the client's. */
  rank: number;
  /**
   * Why this, for *your* problem. Generated per query -- the product is this
   * sentence, not the ordering it arrives in.
   */
  reason: string;

  linked: LinkedEntity[];
}

/**
 * What the corpus could not answer, stated plainly rather than hidden. A
 * filtered session the attendee wanted to know about is worse than a thin
 * result list, so the client is told what was removed and why.
 */
export interface AskDiagnostics {
  /** Sessions dropped because they had already ended at ask time. */
  endedCount: number;
  /** Entities dropped by an audience-level filter. */
  levelFilteredCount: number;
  /** True when nothing in the corpus cleared the score threshold. */
  corpusMiss: boolean;
}

export interface AskRequest {
  eventSlug: string;
  /** Exactly what the attendee typed or said. Never pre-summarised. */
  text: string;
}

export interface AskResponse {
  queryId: string;
  recommendations: RecommendedEntity[];
  diagnostics: AskDiagnostics;
}

export interface TranscribeResponse {
  text: string;
}
