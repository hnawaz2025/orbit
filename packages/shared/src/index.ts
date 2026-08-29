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

// ---------------------------------------------------------------------------
// Plan arithmetic
//
// Shared rather than living in the client because it is the one piece of the
// plan that is a claim about the world rather than a rendering choice: whether
// two sessions actually collide, and whether a person can physically get from
// one to the next. Both are things the server will need the moment a plan is
// something Orbit can reason about rather than just display.

/** Roughly how long it takes to cross a convention centre and find a room. */
export const ROOM_CHANGE_MINUTES = 10;

export interface PlanItem {
  id: string;
  title: string;
  kind: EntityKind;
  locationName: string | null;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
}

export type PlanConflict =
  | { kind: "overlap"; withId: string }
  | { kind: "tight"; withId: string; minutes: number };

/**
 * Problems with a planned item, given everything else in the plan.
 *
 * Two distinct failures, kept distinct because the attendee's response differs.
 * An overlap means choosing -- they cannot attend both, and pretending
 * otherwise is how someone ends up standing in a corridor at 2pm. A tight
 * connection is still possible, just at a jog, and is worth flagging rather
 * than resolving on their behalf.
 *
 * Items with no time are never in conflict: a booth staffed all day and a
 * person are not scheduled, so absence of a time means "not applicable" rather
 * than "unknown".
 */
export function findConflicts(item: PlanItem, others: PlanItem[]): PlanConflict[] {
  if (!item.startsAt || !item.endsAt) return [];

  const start = Date.parse(item.startsAt);
  const end = Date.parse(item.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];

  const conflicts: PlanConflict[] = [];

  for (const other of others) {
    if (other.id === item.id || !other.startsAt || !other.endsAt) continue;

    const otherStart = Date.parse(other.startsAt);
    const otherEnd = Date.parse(other.endsAt);
    if (Number.isNaN(otherStart) || Number.isNaN(otherEnd)) continue;

    if (start < otherEnd && otherStart < end) {
      conflicts.push({ kind: "overlap", withId: other.id });
      continue;
    }

    // Only flag the gap where a room change is actually required. Two
    // back-to-back sessions on the same stage need no walking time, and
    // warning about them would train people to ignore the warning.
    if (otherEnd <= start && item.locationName && other.locationName) {
      if (item.locationName !== other.locationName) {
        const gap = Math.round((start - otherEnd) / 60000);
        if (gap < ROOM_CHANGE_MINUTES) {
          conflicts.push({ kind: "tight", withId: other.id, minutes: gap });
        }
      }
    }
  }

  return conflicts;
}

/** Chronological, with untimed items (people, booths) last. */
export function sortPlan(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => {
    if (!a.startsAt && !b.startsAt) return a.title.localeCompare(b.title);
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return Date.parse(a.startsAt) - Date.parse(b.startsAt);
  });
}

// ---------------------------------------------------------------------------
// Rail state
//
// What the when-and-where block on a card should say. Here rather than in the
// component for the same reason findConflicts is: it is time arithmetic, and
// the rules are worth testing without rendering anything.
//
// The rule the whole thing exists to enforce: the absolute time is always
// present. An earlier version substituted a relative label -- "in 34 min" --
// for anything inside an hour, which during the conference itself is nearly
// every session worth showing, so the number an attendee plans around vanished
// exactly when it mattered most. Relative time is added on top, never instead.

const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export type RailState =
  | { kind: "scheduled"; day: string; start: string; end: string; duration: string }
  | { kind: "urgent"; lead: string; start: string; end: string; duration: string }
  | { kind: "underway"; start: string; end: string; remaining: string }
  | { kind: "untimed"; entity: EntityKind };

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Exported so the same rules can be read without rendering. Returns a
 * discriminated state rather than strings, so the component decides nothing
 * about urgency and this function decides nothing about colour.
 */
export function railState(
  startsAt: string | null,
  endsAt: string | null,
  kind: EntityKind,
  now: Date = new Date()
): RailState {
  // Absence of a time is a fact about the entity, not missing data: a booth is
  // staffed all day and a person is not scheduled at all. The rail says so
  // rather than going blank.
  if (!startsAt) return { kind: "untimed", entity: kind };

  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const minutesAway = Math.round((start.getTime() - now.getTime()) / 60000);
  const minutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;

  const startText = clock(startsAt);
  const endText = end ? `–${clock(endsAt!)}` : "";
  const durationText = minutes ? `${minutes} min` : "";

  if (end && start <= now && now < end) {
    const left = Math.round((end.getTime() - now.getTime()) / 60000);
    return { kind: "underway", start: startText, end: endText, remaining: `${left} min left` };
  }

  if (minutesAway >= 0 && minutesAway < 20) {
    return {
      kind: "urgent",
      lead: `IN ${minutesAway} MIN`,
      start: startText,
      end: endText,
      duration: durationText,
    };
  }

  const isToday = start.toDateString() === now.toDateString();
  return {
    kind: "scheduled",
    day: isToday ? "TODAY" : DAY[start.getDay()],
    start: startText,
    end: endText,
    duration: durationText,
  };
}
