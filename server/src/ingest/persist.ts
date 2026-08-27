import type { LinkKind } from "@prisma/client";
import { prisma } from "../db";
import type { ExtractedEntity } from "./types";

// Writing extracted entities into the corpus, and resolving the relationships
// that extraction could only express as names.

function normalise(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PersistResult {
  written: number;
  linked: number;
  /** Share of entities carrying real description text. */
  coverage: number;
}

/**
 * Upsert every entity, then link them.
 *
 * Two passes, because a talk can name a speaker who is only defined on a
 * different page ingested later in the same run -- resolving links inline would
 * silently drop exactly the speaker→talk edges the person-matching path depends
 * on most.
 */
export async function persistEntities(
  eventSlug: string,
  entities: ExtractedEntity[]
): Promise<PersistResult> {
  const event = await prisma.event.findUniqueOrThrow({ where: { slug: eventSlug } });

  for (const entity of entities) {
    const data = {
      kind: entity.kind,
      title: entity.title,
      subtitle: entity.subtitle ?? null,
      description: entity.description ?? null,
      locationName: entity.locationName ?? null,
      startsAt: entity.startsAt ? new Date(entity.startsAt) : null,
      endsAt: entity.endsAt ? new Date(entity.endsAt) : null,
      level: entity.level ?? null,
      isDurable: entity.isDurable ?? false,
      tags: entity.tags,
      confidence: entity.confidence,
      sourceUrl: entity.sourceUrl,
    };

    await prisma.entity.upsert({
      where: {
        eventId_kind_title: { eventId: event.id, kind: entity.kind, title: entity.title },
      },
      // Re-ingesting must not clobber enrichment or embeddings, which are
      // produced by a later, more expensive stage -- only the scraped facts are
      // refreshed here.
      update: data,
      create: { ...data, eventId: event.id },
    });
  }

  // Second pass: everything for this event now exists, including entities that
  // arrived from other pages in earlier runs.
  const all = await prisma.entity.findMany({
    where: { eventId: event.id },
    select: { id: true, kind: true, title: true },
  });

  const byName = new Map<string, { id: string; kind: string }>();
  for (const row of all) {
    byName.set(normalise(row.title), { id: row.id, kind: row.kind });
  }

  let linked = 0;

  async function link(fromId: string, toId: string, kind: LinkKind) {
    if (fromId === toId) return;
    // createMany+skipDuplicates over a single row: re-running ingest should be
    // a no-op on links, not a unique-constraint crash.
    const result = await prisma.entityLink.createMany({
      data: [{ fromId, toId, kind }],
      skipDuplicates: true,
    });
    linked += result.count;
  }

  for (const entity of entities) {
    const self = byName.get(normalise(entity.title));
    if (!self) continue;

    for (const speakerName of entity.speakerNames ?? []) {
      const speaker = byName.get(normalise(speakerName));
      // A name with no matching PERSON row is skipped rather than created:
      // inventing a speaker from a string in an abstract is exactly the kind of
      // guess that puts a person who does not exist on someone's screen.
      if (speaker?.kind === "PERSON") await link(speaker.id, self.id, "SPEAKS_AT");
    }

    if (entity.orgName) {
      const org = byName.get(normalise(entity.orgName));
      if (org && (org.kind === "ORG" || org.kind === "BOOTH")) {
        await link(self.id, org.id, "WORKS_FOR");
      }
    }
  }

  const withDescription = await prisma.entity.count({
    where: { eventId: event.id, description: { not: null } },
  });
  const total = await prisma.entity.count({ where: { eventId: event.id } });

  return {
    written: entities.length,
    linked,
    coverage: total === 0 ? 0 : withDescription / total,
  };
}
