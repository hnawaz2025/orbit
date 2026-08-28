import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db";

// A deterministic pass over a page whose format is regular enough not to need a
// model.
//
// The speakers page prints every entry as two lines:
//
//     Ajita Kanchivakam Ananth
//     Staff Technical Program Manager @ Google
//
// The model tier reads that and keeps the role while dropping the employer, so
// 143 speakers ended up with a subtitle like "Solutions Engineer" and no
// company anywhere. That is not a small loss. The employer is the only thing
// that identifies a speaker well enough to enrich them safely -- searching a
// bare name plus a generic job title returns whichever person the web prefers,
// and attaching a stranger's credentials to a speaker card is worse than
// leaving the row thin.
//
// This is what a Tier 1 adapter looks like in miniature: where a source has
// real structure, parse it rather than asking a model to. No variance, no
// tokens, no confidence floor -- a line either matches the shape or it does
// not.

const CACHE_DIR = path.resolve(__dirname, "../../.cache/pages");

/** Matches "Role @ Company", which is how the page prints every speaker. */
const ROLE_AT_COMPANY = /^(.{2,120}?)\s+@\s+(.{2,80})$/;

function normalise(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface SpeakerFact {
  name: string;
  role: string;
  company: string;
}

/**
 * Pull (name, role, company) triples out of the page text.
 *
 * Exported separately from the database work so the parsing is testable without
 * a corpus -- the part most likely to break when the page changes shape.
 */
export function parseSpeakerPage(text: string): SpeakerFact[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const facts: SpeakerFact[] = [];

  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(ROLE_AT_COMPANY);
    if (!match) continue;

    const name = lines[i - 1];

    // The preceding line has to look like a person's name. Without this the
    // navigation menu and marketing copy above the listing produce entries
    // whose "name" is a heading.
    const plausibleName =
      name.length >= 3 &&
      name.length <= 60 &&
      !name.includes("@") &&
      /^[\p{L}][\p{L}\p{M}'’.\- ]+$/u.test(name) &&
      name.split(/\s+/).length <= 6;

    if (!plausibleName) continue;

    facts.push({ name, role: match[1].trim(), company: match[2].trim() });
  }

  return facts;
}

export interface BackfillResult {
  parsed: number;
  updated: number;
  unmatched: number;
}

export async function backfillSpeakers(
  eventSlug: string,
  speakersUrl: string
): Promise<BackfillResult> {
  const cacheFile = path.join(
    CACHE_DIR,
    `${createHash("sha256").update(speakersUrl).digest("hex")}.txt`
  );

  const text = await readFile(cacheFile, "utf8");
  const facts = parseSpeakerPage(text);

  const event = await prisma.event.findUniqueOrThrow({ where: { slug: eventSlug } });
  const people = await prisma.entity.findMany({
    where: { eventId: event.id, kind: "PERSON", retiredAt: null },
    select: { id: true, title: true },
  });

  const byName = new Map(people.map((person) => [normalise(person.title), person.id]));

  let updated = 0;
  let unmatched = 0;

  for (const fact of facts) {
    const id = byName.get(normalise(fact.name));
    if (!id) {
      unmatched++;
      continue;
    }

    await prisma.entity.update({
      where: { id },
      data: {
        // The full line as printed. Both halves matter: the role is what an
        // attendee reads, the company is what makes the person identifiable.
        subtitle: `${fact.role} @ ${fact.company}`,
        // Changing subtitle changes the embedding source, and embed.ts is
        // content-hash keyed, so the next embed run picks these up on its own.
      },
    });
    updated++;
  }

  return { parsed: facts.length, updated, unmatched };
}
