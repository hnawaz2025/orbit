/**
 * Whether something is still ahead of the attendee.
 *
 * One definition, used by both routes that emit linked entities, because this
 * rule was written twice inline and enforced in neither: /ask filtered ended
 * sessions out of its candidates but not out of the sessions hanging off a
 * recommended person, and /events/:slug/entities/:id did not filter at all. A
 * speaker was recommended at a conference with "catch them at" a talk that had
 * finished that morning.
 *
 * Absence of an end time means "not time-bound", never "expired". A booth is
 * staffed all day and a person is not scheduled at all, so both stay.
 */
export function isStillToCome(endsAt: string | Date | null | undefined, now: Date): boolean {
  if (!endsAt) return true;
  const ends = endsAt instanceof Date ? endsAt.getTime() : Date.parse(endsAt);
  // An unparseable timestamp is missing data, not an expiry. Dropping a
  // session because its time is malformed would hide it from the one person
  // it was relevant to.
  if (Number.isNaN(ends)) return true;
  return ends > now.getTime();
}
