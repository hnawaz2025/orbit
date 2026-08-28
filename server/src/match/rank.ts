import type { Candidate, EntityKind } from "./types";

// Ranking, and the one opinion that separates Orbit from search.
//
// Similarity alone answers "what is this conference about that resembles your
// question". That is not the question an attendee has. They are standing in a
// building for two days, and the useful answer weighs how much of a thing is
// only available *here, now* -- which is what every factor below adjusts for.

/**
 * How much a recorded session is discounted.
 *
 * The schema argues the case and this is where it becomes arithmetic: the
 * recording will exist next month, the chance to ask the speaker your specific
 * question will not. 0.8 rather than something harsher because a recorded talk
 * is still a real match -- this reorders near-ties, it does not bury a session
 * that is plainly the best answer.
 */
const DURABLE_FACTOR = 0.8;

/**
 * A session already underway. Walking in late is possible and sometimes right,
 * so it stays in the list, but it loses to anything comparable that has not
 * started.
 */
const IN_PROGRESS_FACTOR = 0.65;

/**
 * A session starting inside the walk buffer. Reachable, but only just, and
 * recommending a room the attendee cannot physically get to is the same failure
 * as recommending one that does not exist.
 */
const TIGHT_FACTOR = 0.9;

/** Roughly how long it takes to cross a convention centre and find a room. */
const WALK_BUFFER_MS = 10 * 60 * 1000;

/**
 * Added when a candidate is linked to another candidate in the same result set
 * -- the speaker whose talk also matched, the company whose booth also matched.
 *
 * Additive and small on purpose. This is a tie-breaker that surfaces the
 * two-birds opportunity ("she is speaking at 2, and her booth is open until
 * 4"), not a signal strong enough to promote a weak match on connectivity
 * alone.
 */
const LINK_BONUS = 0.04;
const MAX_LINK_BONUS = 0.12;

/**
 * Applied to candidates that are not the kind of thing the attendee asked for.
 *
 * Deliberately a discount on the others rather than a boost on the match, and
 * deliberately mild. Someone asking to meet a person is best served by people,
 * but the single most relevant thing at the conference might still be a session
 * -- and a preference should reorder a close field, not overrule an obvious
 * answer. 0.75 is enough to change the top of the list when scores are close
 * and not enough to bury a standout.
 */
const KIND_MISMATCH_FACTOR = 0.75;

export interface RankedCandidate extends Candidate {
  score: number;
  rank: number;
}

/**
 * How reachable a candidate is at ask time.
 *
 * Entities with no start time -- a person, a booth staffed all day -- are fully
 * reachable by definition. Absence of a time here means "not time-bound", not
 * "unknown", because ingestion drops a time it could not read rather than
 * guessing one.
 */
export function reachabilityFactor(candidate: Candidate, now: Date): number {
  if (!candidate.startsAt) return 1;

  const startsIn = candidate.startsAt.getTime() - now.getTime();

  if (startsIn <= 0) return IN_PROGRESS_FACTOR;
  if (startsIn < WALK_BUFFER_MS) return TIGHT_FACTOR;
  return 1;
}

/**
 * Score one candidate. Exported so tests can assert the factors independently
 * of the sort.
 */
export function scoreCandidate(
  candidate: Candidate,
  now: Date,
  linkedBonus: number = 0,
  preferred: EntityKind[] | null = null
): number {
  const durability = candidate.isDurable ? DURABLE_FACTOR : 1;
  const kindFit = !preferred || preferred.includes(candidate.kind) ? 1 : KIND_MISMATCH_FACTOR;
  return (
    candidate.similarity * durability * kindFit * reachabilityFactor(candidate, now) + linkedBonus
  );
}

export function rankCandidates(
  candidates: Candidate[],
  now: Date,
  preferred: EntityKind[] | null = null
): RankedCandidate[] {
  const present = new Set(candidates.map((candidate) => candidate.id));

  const scored = candidates.map((candidate) => {
    // Only links to entities that also matched count. A speaker linked to forty
    // talks is not forty times more relevant -- what matters is whether the
    // other end is something this attendee was already being shown.
    const connections = candidate.linkedIds.filter((id) => id !== candidate.id && present.has(id));
    const bonus = Math.min(connections.length * LINK_BONUS, MAX_LINK_BONUS);

    return { candidate, score: scoreCandidate(candidate, now, bonus, preferred) };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Deterministic tie-break. Without it, two entities with identical scores
      // can swap places between identical requests, which reads as flakiness in
      // a demo and makes ranking bugs unreproducible.
      return a.candidate.id.localeCompare(b.candidate.id);
    })
    .map((entry, index) => ({ ...entry.candidate, score: entry.score, rank: index + 1 }));
}
