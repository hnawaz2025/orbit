import "dotenv/config";
import { prisma } from "../db";
import { createGenericAdapter } from "./adapters/generic";
import { embedEntities } from "./embed";
import { persistEntities } from "./persist";
import { findEvent } from "./sources";
import type { ExtractedEntity } from "./types";

// CLI:  npm run ingest -- <event-slug> [--refresh]
//
// Run repeatedly. Pages are cached on disk after the first fetch and entity
// writes are upserts, so re-running after a prompt change re-extracts without
// re-requesting anyone's site.
//
// --refresh re-fetches every page instead of reading that cache. Without it,
// ingest is structurally incapable of noticing that a conference changed its
// programme -- which is the normal state of a conference agenda, and most true
// during the event itself.

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const slug = args.find((arg) => !arg.startsWith("--"));
  if (!slug) {
    console.error("Usage: npm run ingest -- <event-slug> [--refresh]");
    process.exit(1);
  }

  const definition = findEvent(slug);
  const startsAt = new Date(definition.startsAt);
  const endsAt = new Date(definition.endsAt);

  const event = await prisma.event.upsert({
    where: { slug: definition.slug },
    update: { name: definition.name, venue: definition.venue, timezone: definition.timezone, startsAt, endsAt },
    create: {
      slug: definition.slug,
      name: definition.name,
      venue: definition.venue,
      timezone: definition.timezone,
      startsAt,
      endsAt,
    },
  });

  console.log(
    `Ingesting ${event.name} (${definition.sources.length} sources)${refresh ? " [refreshing cache]" : ""}\n`
  );

  // Only the generic adapter exists today. When a platform adapter lands, the
  // registry is tried in tier order and this becomes the fallback.
  const adapter = createGenericAdapter({ startsAt, endsAt }, { refresh });
  const collected: ExtractedEntity[] = [];

  // Only sources we actually re-read are eligible to retire anything. See the
  // note on PersistOptions: a source that failed tells us nothing about whether
  // its entities still exist, and treating silence as removal would let one
  // 404 empty the corpus.
  const fetchedSources: string[] = [];

  for (const source of definition.sources) {
    console.log(`${source.url}`);
    try {
      const entities = await adapter.collect({ eventSlug: definition.slug, ...source });
      console.log(`  -> ${entities.length} entities after dedupe\n`);
      collected.push(...entities);
      fetchedSources.push(source.url);
    } catch (error) {
      // A single unreachable page should not abandon a corpus that is otherwise
      // fine. The coverage number at the end is what says whether the result is
      // actually servable.
      console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  if (collected.length === 0) {
    console.error("No entities extracted. Corpus unchanged.");
    process.exit(1);
  }

  const result = await persistEntities(definition.slug, collected, {
    reconcileSources: fetchedSources,
  });

  const byKind = collected.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.kind] = (counts[entity.kind] ?? 0) + 1;
    return counts;
  }, {});

  // Embedding is part of ingestion, not a separate chore. A corpus without
  // vectors is not a partially-working corpus -- it is an unsearchable one, and
  // leaving this to a second command means the failure shows up as an empty
  // result list rather than as a stage that did not run.
  console.log("\nembedding...");
  const embedded = await embedEntities(definition.slug);
  console.log(
    `  embedded ${embedded.embedded}, unchanged ${embedded.skipped}, failed ${embedded.failed}`
  );

  console.log("---");
  console.log(
    `written: ${result.written}   links: ${result.linked}   retired: ${result.retired}   revived: ${result.revived}`
  );
  console.log(`by kind: ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join("  ")}`);
  console.log(`description coverage: ${(result.coverage * 100).toFixed(0)}%`);

  // Matching quality is bounded by how much real text each entity carries. A
  // corpus of bare titles retrieves nothing useful no matter how good the
  // prompt is, so it is worth failing loudly here rather than discovering it
  // from a bad recommendation in front of an attendee.
  if (result.coverage < 0.4) {
    console.warn(
      "\nWARNING: under 40% of entities have descriptions. Retrieval will be weak — " +
        "check whether the source pages actually render abstracts, or add a richer source."
    );
  }

  // A row that reached the corpus but never got a vector is invisible to
  // matching, which looks identical to it not being there at all. Worth saying
  // out loud rather than leaving to be discovered from a thin result list.
  // Retirement is the one destructive-looking outcome here, so it is reported
  // loudly with its cause. A large number usually means a source changed shape
  // rather than that a conference cancelled half its programme.
  if (result.retired > 0) {
    console.log(
      `\n${result.retired} entities retired -- their source was re-read and no longer lists them.`
    );
  }

  if (embedded.failed > 0) {
    console.warn(
      `\nWARNING: ${embedded.failed} entities have no embedding and cannot be matched. ` +
        "Re-run ingest to retry them."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
