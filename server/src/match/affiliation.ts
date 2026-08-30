import { prisma } from "../db";

// Some questions are lookups, not searches.
//
// "Who is here from Google?" is not a semantic problem -- it is a filter on an
// attribute the corpus already stores. Embedding it and taking the nearest
// neighbours puts "Google" next to a great deal of AI content and nowhere near
// a person whose subtitle ends in "@ Google", which is exactly what happened:
// a corpus holding eight Google engineers returned one, behind two unrelated
// roundtables.
//
// Retrieval handles "what should I learn about X". This handles "who is here
// from X", which is a different question wearing similar words.

/** Employers named in the corpus, lowercased, longest first for greedy match. */
export async function knownOrganisations(eventId: string): Promise<string[]> {
  const people = await prisma.entity.findMany({
    where: { eventId, retiredAt: null, kind: "PERSON", subtitle: { not: null } },
    select: { subtitle: true },
  });
  const orgs = await prisma.entity.findMany({
    where: { eventId, retiredAt: null, kind: { in: ["ORG", "BOOTH"] } },
    select: { title: true },
  });

  const names = new Set<string>();

  for (const person of people) {
    // Subtitles are "Role @ Company", which backfillSpeakers guarantees for
    // 166 of 174 speakers.
    const employer = person.subtitle?.split(/\s+@\s+/)[1]?.trim();
    if (employer && employer.length > 2) names.add(employer.toLowerCase());
  }
  for (const org of orgs) names.add(org.title.trim().toLowerCase());

  return [...names].sort((a, b) => b.length - a.length);
}

/**
 * Organisations the question actually names.
 *
 * Matched against the corpus rather than extracted freely, so "I work at a
 * bank" does not become a search for a company called "a bank". Only names the
 * conference already knows about can be matched, which makes a false positive
 * nearly impossible and keeps this from firing on ordinary prose.
 */
export function findOrganisations(text: string, known: string[]): string[] {
  const haystack = ` ${text.toLowerCase()} `;
  const found: string[] = [];

  for (const name of known) {
    // Word-boundary match, so "Kong" does not fire on "Hong Kong" and "AI"
    // does not fire on every third word.
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(name)}([^a-z0-9]|$)`, "i");
    if (pattern.test(haystack)) found.push(name);
  }

  // Word boundaries are not enough on their own: "Kong" is a whole word inside
  // "Hong Kong", and "Impart" and "Seedling" are ordinary English. Short names
  // are therefore only accepted when the question is visibly about affiliation
  // -- "from", "at", "works" -- which is how someone actually asks this.
  //
  // Six characters is the cutoff because the collisions are all short: no one
  // writes "salesforce" or "wundergraph" by accident, and requiring wording for
  // those would miss the common phrasing "any Salesforce folks here?".
  const UNAMBIGUOUS_LENGTH = 6;
  const asksAboutAffiliation = /\bfrom\b|\bat\b|\bworks?\b|\bwho\b|\bmeet\b|\bpeople\b/i.test(text);

  return found.filter((name) => name.length >= UNAMBIGUOUS_LENGTH || asksAboutAffiliation);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Entities affiliated with any of the named organisations.
 *
 * Returns ids only; scoring stays in one place. Includes the organisation
 * itself where the corpus has it, because "who is here from Kong" is answered
 * partly by Kong's booth.
 */
export async function affiliatedEntityIds(
  eventId: string,
  organisations: string[]
): Promise<Set<string>> {
  if (organisations.length === 0) return new Set();

  const rows = await prisma.entity.findMany({
    where: {
      eventId,
      retiredAt: null,
      OR: organisations.flatMap((name) => [
        { subtitle: { contains: name, mode: "insensitive" as const } },
        { title: { equals: name, mode: "insensitive" as const } },
      ]),
    },
    select: { id: true },
  });

  return new Set(rows.map((row) => row.id));
}
