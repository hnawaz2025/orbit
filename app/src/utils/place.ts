/**
 * Room names as an attendee should read them.
 *
 * The conference publishes "API World -- Workshop Stage A (PRO)". The leading
 * conference name is on every room and carries no information inside the app,
 * and the raw double hyphen is a database artefact that should never have
 * reached a screen.
 *
 * Shared rather than reimplemented per screen -- which is how "AI TechWorld --
 * Main Stage" came to render raw on the plan while the results cards showed it
 * correctly.
 */
export function shortPlace(location: string | null | undefined): string | null {
  if (!location) return null;
  const cleaned = location
    .replace(/^(API World|AI TechWorld|CloudX|Santa Clara Convention Center)\s*--?\s*/i, "")
    .replace(/\s+--\s+/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
