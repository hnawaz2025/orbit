import type { LinkKind } from "@prisma/client";
import { prisma } from "../db";
import type { ExtractedEntity } from "./types";

// Writing extracted entities into the corpus, and resolving the relationships
// that extraction could only express as names.

/**
 * The most of one source's entities a single run may retire.
 *
 * Above this, the run is assumed to have read the page badly rather than the
 * conference to have cancelled its programme. See the reconciliation block.
 */
const MAX_RETIRE_SHARE = 0.3;

function normalise(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PersistResult {
  written: number;
  linked: number;
  /** Entities retired because their source no longer lists them. */
  retired: number;
  /** Entities that had been retired and reappeared at their source. */
  revived: number;
  /** Share of entities carrying real description text. */
  coverage: number;
}

export interface PersistOptions {
  /**
   * Source URLs that were fetched successfully in this run.
   *
   * Reconciliation is scoped to these and nothing else, which is the whole
   * safety property. "Not seen this run" is only evidence of removal if we
   * actually re-read the page -- otherwise one 404 on the speakers page would
   * retire every speaker in the corpus, and run.ts deliberately continues past
   * a failed source, so that path is very reachable.
   */
  reconcileSources?: string[];
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
  entities: ExtractedEntity[],
  options: PersistOptions = {}
): Promise<PersistResult> {
  const event = await prisma.event.findUniqueOrThrow({ where: { slug: eventSlug } });

  // One timestamp for the whole run, taken before the first write. Using
  // new Date() per row would make "seen before this run" ambiguous for rows
  // written while the run was still going.
  const runAt = new Date();
  let revived = 0;

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
      lastSeenAt: runAt,
      // Seeing an entity again un-retires it. Conferences pull sessions and
      // reinstate them, and reviving the existing row keeps its embedding and
      // its links rather than rebuilding both.
      retiredAt: null,
    };

    const existing = await prisma.entity.findUnique({
      where: {
        eventId_kind_title: { eventId: event.id, kind: entity.kind, title: entity.title },
      },
      select: { retiredAt: true },
    });
    if (existing?.retiredAt) revived++;

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

  // Reconciliation. Anything whose source we re-read successfully, and which
  // that source no longer lists, is retired -- a cancelled session, a speaker
  // who withdrew, a booth that pulled out.
  //
  // Soft, never deleted: a Recommendation already made should still resolve to
  // the thing it named even after that thing is gone, or the organizer-facing
  // history quietly rewrites itself.
  let retired = 0;
  for (const sourceUrl of options.reconcileSources ?? []) {
    const where = {
      eventId: event.id,
      sourceUrl,
      lastSeenAt: { lt: runAt },
      retiredAt: null,
    };

    const missing = await prisma.entity.count({ where });
    if (missing === 0) continue;

    const liveForSource = await prisma.entity.count({
      where: { eventId: event.id, sourceUrl, retiredAt: null },
    });

    // Reconciliation assumes "the source no longer lists it" is evidence of
    // removal. That holds for a deterministic adapter reading structured data.
    // It does NOT hold for the model tier: extraction varies run to run, and a
    // chunk that returns fewer entities than last time is a lapse, not a
    // cancellation.
    //
    // A conference cancelling a third of a page between runs is not a thing
    // that happens; an extraction missing a third of one demonstrably is --
    // earlier runs of this pipeline returned 139, 23 and 0 entities for the
    // same page. So a mass disappearance is treated as a failed read and
    // retires nothing, loudly. Real cancellations arrive a few at a time and
    // pass under the ceiling.
    const share = liveForSource === 0 ? 0 : missing / liveForSource;
    if (share > MAX_RETIRE_SHARE) {
      console.warn(
        `  refusing to retire ${missing}/${liveForSource} entities from ${sourceUrl} ` +
          `(${Math.round(share * 100)}% — over the ${Math.round(MAX_RETIRE_SHARE * 100)}% ceiling). ` +
          "Treating this as an incomplete extraction rather than a cancelled programme."
      );
      continue;
    }

    const result = await prisma.entity.updateMany({ where, data: { retiredAt: runAt } });
    retired += result.count;
  }

  const live = { eventId: event.id, retiredAt: null };
  const withDescription = await prisma.entity.count({
    where: { ...live, description: { not: null } },
  });
  const total = await prisma.entity.count({ where: live });

  return {
    written: entities.length,
    linked,
    retired,
    revived,
    coverage: total === 0 ? 0 : withDescription / total,
  };
}
