import { admits, type PassTier } from "@orbit/shared";
import { normaliseLevel, type Candidate, type LevelBand } from "./types";

// What gets removed before ranking, and why the removal is always reported.
//
// The governing rule, stated once here because it constrains every function
// below: Orbit filters *for* an attendee, and never editorialises about a
// session. A talk removed here is removed because it is over, or because the
// conference's own audience label puts it far from where the attendee said they
// are -- never because we judged it weak. Orbit does not tell anyone to skip a
// named talk, and the diagnostics exist so a thin result list can say "eleven
// sessions had already ended" instead of silently looking empty.

export interface FilterInput {
  candidates: Candidate[];
  /** Wall-clock at ask time. Injected rather than read, so this is testable. */
  now: Date;
  /**
   * Where the attendee placed themselves, if they said. Absent for most
   * queries -- people describe a problem, not a seniority.
   */
  attendeeLevel?: LevelBand | null;

  /**
   * What the attendee's ticket admits.
   *
   * Unlike the level filter, this is not a judgement about fit -- it is a door
   * that will not open. A PRO workshop recommended to an OPEN pass holder
   * sends a real person somewhere they cannot go, which is the same damage as
   * an invented room.
   */
  pass?: PassTier | null;
}

export interface FilterOutcome {
  kept: Candidate[];
  /** Sessions already finished at ask time. */
  endedCount: number;
  /** Sessions dropped as far from the attendee's stated level. */
  levelFilteredCount: number;
  /** Sessions their pass does not admit. */
  passFilteredCount: number;
}

/**
 * A session is only dropped when the gap is the full width of the scale --
 * a beginner against an advanced session, or the reverse.
 *
 * One band of distance is left alone deliberately. An intermediate attendee is
 * well served by both beginner and advanced material, and the labels are
 * self-assigned by speakers with no shared rubric, so treating a one-band gap
 * as meaningful would discard good matches on the strength of a word someone
 * typed into a CFP form.
 */
function isFarFromAttendee(entityLevel: LevelBand, attendeeLevel: LevelBand): boolean {
  return Math.abs(entityLevel - attendeeLevel) >= 2;
}

export function filterCandidates(input: FilterInput): FilterOutcome {
  const { candidates, now, attendeeLevel, pass } = input;

  const kept: Candidate[] = [];
  let endedCount = 0;
  let levelFilteredCount = 0;
  let passFilteredCount = 0;

  for (const candidate of candidates) {
    // Over is over. A session that ended is not a recommendation, it is a
    // reminder of one -- and an attendee sent to an empty room stops trusting
    // every other card on the screen.
    //
    // Entities with no end time are never dropped by this rule: a booth is
    // staffed all day and a person is not time-bound at all, so absence of an
    // end time means "not applicable", not "expired".
    if (candidate.endsAt && candidate.endsAt.getTime() <= now.getTime()) {
      endedCount++;
      continue;
    }

    // Checked before level, because it is a fact about access rather than an
    // opinion about fit -- and counted separately so the attendee can be told
    // their ticket, not our judgement, is what removed these.
    if (pass && !admits(pass, candidate.tags)) {
      passFilteredCount++;
      continue;
    }

    if (attendeeLevel) {
      const entityLevel = normaliseLevel(candidate.level);
      if (entityLevel && isFarFromAttendee(entityLevel, attendeeLevel)) {
        levelFilteredCount++;
        continue;
      }
    }

    kept.push(candidate);
  }

  return { kept, endedCount, levelFilteredCount, passFilteredCount };
}
