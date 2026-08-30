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
  /**
   * When the linked thing happens.
   *
   * Carried because it is the answer to the only question that matters about a
   * person: where will they be. A speaker has no time of their own -- they are
   * not scheduled -- but they are findable at their session, so "meet Ishaan
   * Gupta" is only actionable as "he is on at 15:00 on the Main Stage".
   */
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
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

  /**
   * A public profile to connect on, where one was confirmed.
   *
   * The exchange this product exists to cause usually ends with "let us
   * connect", and having the link already there is the difference between an
   * intention and a connection.
   */
  profileUrl: string | null;

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
  /**
   * True when something was found, but nothing that is really about their
   * problem. Distinct from corpusMiss: there is a list, and it should be shown
   * with the caveat rather than presented as answers.
   */
  weakMatch: boolean;
  /** Sessions their pass does not admit. Reported, never silently dropped. */
  passFilteredCount: number;
}

/**
 * What the attendee actually bought.
 *
 * Ordered by what it admits. A conference sells access in tiers and prints the
 * tier on every session, so recommending a PRO workshop to someone holding an
 * OPEN pass sends them to a door that will not open -- the same failure as an
 * invented room, and at API World it would apply to 40% of the programme.
 */
export const PASS_TIERS = ["OPEN", "PRO", "PREMIUM"] as const;
export type PassTier = (typeof PASS_TIERS)[number];

/** How each tier is written in the conference's own tags. */
const PASS_TAG: Record<PassTier, string> = {
  OPEN: "open pass",
  PRO: "pro pass",
  PREMIUM: "premium pass",
};

/**
 * Whether a pass admits an entity.
 *
 * An entity carrying no pass tag at all is admitted. Absence means the source
 * did not say, and refusing to show a session because a tag is missing would
 * turn an incomplete listing into a smaller conference.
 */
export function admits(tier: PassTier, tags: string[]): boolean {
  const lower = tags.map((t) => t.toLowerCase());
  const passTags = lower.filter((t) => t.endsWith("pass") || t === "invite only");
  if (passTags.length === 0) return true;

  // Invite-only is not a tier anyone can buy into.
  if (passTags.includes("invite only") && passTags.length === 1) return false;

  return passTags.includes(PASS_TAG[tier]);
}

export interface AskRequest {
  eventSlug: string;
  /** Exactly what the attendee typed or said. Never pre-summarised. */
  text: string;
  /** Omitted means show everything, which is the right default before they say. */
  pass?: PassTier;
}

export interface AskResponse {
  queryId: string;
  /**
   * The venue's IANA timezone.
   *
   * On the wire because a conference schedule is written in the venue's wall
   * clock, and rendering it in the device's zone is wrong in the ordinary case:
   * a session at noon in Santa Clara displayed as 15:00 to anyone whose phone
   * had not switched zones. An attendee travelling in, or checking their
   * schedule the night before from home, would have been given times that were
   * confidently and uniformly wrong.
   */
  timezone: string;
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

export type RailState =
  | { kind: "scheduled"; day: string; start: string; end: string; duration: string }
  | { kind: "urgent"; lead: string; start: string; end: string; duration: string }
  | { kind: "underway"; start: string; end: string; remaining: string }
  | { kind: "untimed"; entity: EntityKind };

function clock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
}

/** Which local day an instant falls on, in the venue's zone. */
export function venueDayKey(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone });
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
  now: Date = new Date(),
  /** The venue's zone. Times are the conference's, not the phone's. */
  timeZone?: string
): RailState {
  // Absence of a time is a fact about the entity, not missing data: a booth is
  // staffed all day and a person is not scheduled at all. The rail says so
  // rather than going blank.
  if (!startsAt) return { kind: "untimed", entity: kind };

  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const minutesAway = Math.round((start.getTime() - now.getTime()) / 60000);
  const minutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;

  const startText = clock(startsAt, timeZone);
  const endText = end ? `–${clock(endsAt!, timeZone)}` : "";
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

  // "Today" is today at the venue. Someone checking from another zone late at
  // night should not be told a session is tomorrow when the conference floor
  // still calls it today.
  const isToday = venueDayKey(startsAt, timeZone) === venueDayKey(now.toISOString(), timeZone);
  const weekday = new Date(startsAt).toLocaleDateString("en-US", { weekday: "short", timeZone });
  return {
    kind: "scheduled",
    day: isToday ? "TODAY" : weekday.toUpperCase(),
    start: startText,
    end: endText,
    duration: durationText,
  };
}

// ---------------------------------------------------------------------------
// Timeline layout
//
// Turning a plan into rows a calendar can draw. Pure, because the geometry is
// where this goes wrong: a schedule that renders the wrong shape is worse than
// a list, since it looks authoritative.

/** Points per minute. A 50-minute session becomes 150pt. */
export const PT_PER_MIN = 3.0;

/**
 * Floor height for a block.
 *
 * A 25-minute session computes to 75pt, which cannot hold a two-line title plus
 * a room row: 12 pad + 46 title + 4 + 19 room + 12 pad = 84. The distortion is
 * at most 9pt, never affects ordering, and is safe because every block prints
 * its real time range -- nothing about the schedule is inferred from height
 * alone. A calendar that renders a 25-minute session too short to read is a
 * calendar nobody opens in a corridor.
 */
export const MIN_BLOCK_H = 84;

/** Above this, empty time collapses to a cuff. Below, it renders true to scale. */
export const GAP_COLLAPSE_MIN = 30;

/** Fixed height of a collapsed gap, whatever its real length. */
export const CUFF_H = 64;

export type TimelineRow =
  | {
      kind: "group";
      /** Colliding items, rendered side by side. At most two are drawn. */
      items: PlanItem[];
      /** How many could not be drawn, surfaced as a chooser chip. */
      overflow: number;
      height: number;
      /** True when these genuinely cannot all be attended. */
      collides: boolean;
      startsAt: IsoDateTime;
    }
  | {
      kind: "gap";
      minutes: number;
      height: number;
      collapsed: boolean;
      from: IsoDateTime;
      to: IsoDateTime;
    };

export interface Timeline {
  rows: TimelineRow[];
  /** Not on the time axis at all: people, booths. */
  anytime: PlanItem[];
}

function overlaps(a: PlanItem, b: PlanItem): boolean {
  if (!a.startsAt || !a.endsAt || !b.startsAt || !b.endsAt) return false;
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
    Date.parse(b.startsAt) < Date.parse(a.endsAt);
}

function blockHeight(item: PlanItem): number {
  if (!item.startsAt || !item.endsAt) return MIN_BLOCK_H;
  const minutes = (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000;
  return Math.max(MIN_BLOCK_H, Math.round(minutes * PT_PER_MIN));
}

/**
 * Lay out one day of a plan.
 *
 * `dayKey` is a venue-local date (YYYY-MM-DD from venueDayKey), so which day a
 * session belongs to follows the conference floor rather than the reader's
 * phone. A 6pm Pacific session is not tomorrow because someone is checking
 * their plan from London.
 */
export function buildTimeline(items: PlanItem[], dayKey: string, timeZone?: string): Timeline {
  const anytime = items.filter((i) => !i.startsAt);

  const timed = items
    .filter((i) => i.startsAt && venueDayKey(i.startsAt, timeZone) === dayKey)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));

  // Cluster anything that collides, transitively: A overlapping B and B
  // overlapping C puts all three in one group, because drawing them as
  // separate rows would imply an order they do not have.
  const clusters: PlanItem[][] = [];
  for (const item of timed) {
    const joined = clusters.find((cluster) => cluster.some((other) => overlaps(item, other)));
    if (joined) joined.push(item);
    else clusters.push([item]);
  }

  const rows: TimelineRow[] = [];
  let previousEnd: number | null = null;

  for (const cluster of clusters) {
    const startsAt = cluster[0].startsAt!;
    const start = Date.parse(startsAt);

    if (previousEnd !== null && start > previousEnd) {
      const minutes = Math.round((start - previousEnd) / 60000);
      if (minutes > 0) {
        const collapsed = minutes > GAP_COLLAPSE_MIN;
        rows.push({
          kind: "gap",
          minutes,
          collapsed,
          height: collapsed ? CUFF_H : Math.round(minutes * PT_PER_MIN),
          from: new Date(previousEnd).toISOString(),
          to: startsAt,
        });
      }
    }

    // Three or more never split into thirds -- 97pt cannot hold a session
    // title. Two are drawn and the rest become a chooser.
    const drawn = cluster.slice(0, 2);
    rows.push({
      kind: "group",
      items: drawn,
      overflow: cluster.length - drawn.length,
      height: Math.max(...cluster.map(blockHeight)),
      collides: cluster.length > 1,
      startsAt,
    });

    previousEnd = Math.max(...cluster.map((i) => Date.parse(i.endsAt ?? i.startsAt!)));
  }

  return { rows, anytime };
}

/** Days the plan touches, venue-local, in order. */
export function planDays(items: PlanItem[], timeZone?: string): string[] {
  const days = new Set(
    items.filter((i) => i.startsAt).map((i) => venueDayKey(i.startsAt!, timeZone))
  );
  // ISO-ish YYYY-MM-DD sorts lexicographically, which is why en-CA is used.
  return [...days].sort();
}
