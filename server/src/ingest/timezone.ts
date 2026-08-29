/**
 * Resolving a wall-clock time in a named zone to a real instant.
 *
 * Sessionize returns naive local times -- "2026-09-01T12:00:00", with no offset
 * -- which is correct of it, because a conference schedule is written in the
 * venue's wall clock. But a Date built from that string is interpreted in
 * whatever zone the server happens to run in, so a session at noon in Santa
 * Clara becomes noon UTC on a cloud host: seven hours wrong, on every session,
 * silently. The ranking that decides whether an attendee can still reach a room
 * would be operating on fiction.
 */

/** How far the named zone is from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value])
  ) as Record<string, string>;

  // Intl renders hour 24 for midnight under hour12:false, which Date.UTC reads
  // as the next day.
  const hour = Number(parts.hour) % 24;

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );

  return asIfUtc - instant.getTime();
}

/**
 * Convert a naive local timestamp in `timeZone` to a UTC ISO string.
 *
 * Applied twice: the first offset is looked up at approximately the right
 * instant, and re-checking with that correction applied fixes the case where
 * the approximation lands on the far side of a daylight-saving boundary from
 * the real answer.
 */
export function localToUtcIso(naive: string, timeZone: string): string | null {
  const withoutZone = naive.replace(/[Zz]|[+-]\d{2}:?\d{2}$/, "");
  const guess = Date.parse(`${withoutZone}Z`);
  if (Number.isNaN(guess)) return null;

  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);

  return new Date(instant).toISOString();
}
