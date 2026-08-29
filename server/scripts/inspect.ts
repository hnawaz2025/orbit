import "dotenv/config";
import { prisma } from "../src/db";

// npm run inspect -- <event-slug>
//
// What actually landed in the corpus, in the terms that decide whether
// retrieval will work: field coverage, link density, and how many rows carry
// enough text to embed meaningfully. Ingest prints what it *wrote*; this prints
// what is *there*, which is the number that matters after several runs.

async function main() {
  const slug = process.argv[2] ?? "api-world-2026";
  const event = await prisma.event.findUnique({ where: { slug } });
  if (!event) {
    console.error(`No event "${slug}".`);
    process.exit(1);
  }

  // retiredAt matters here: retired rows are excluded from retrieval, so
  // counting them reports coverage for a corpus nobody can search. This script
  // was written before retirement existed and quietly over-reported for
  // several runs.
  const entities = await prisma.entity.findMany({
    where: { eventId: event.id, retiredAt: null },
  });
  const links = await prisma.entityLink.count({
    where: { from: { eventId: event.id, retiredAt: null }, to: { retiredAt: null } },
  });

  console.log(`${event.name}  (${entities.length} entities, ${links} links)\n`);

  const byKind = new Map<string, typeof entities>();
  for (const entity of entities) {
    const bucket = byKind.get(entity.kind) ?? [];
    bucket.push(entity);
    byKind.set(entity.kind, bucket);
  }

  const pct = (n: number, total: number) =>
    total === 0 ? "  -" : `${String(Math.round((n / total) * 100)).padStart(3)}%`;

  console.log("kind       count   loc   time   desc  tags  embed");
  console.log("--------------------------------------------------");
  for (const [kind, rows] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const n = rows.length;
    console.log(
      `${kind.padEnd(10)} ${String(n).padStart(5)}  ` +
        `${pct(rows.filter((r) => r.locationName).length, n)}  ` +
        `${pct(rows.filter((r) => r.startsAt).length, n)}  ` +
        `${pct(rows.filter((r) => r.description).length, n)}  ` +
        `${pct(rows.filter((r) => r.tags.length > 0).length, n)}  ` +
        `${pct(rows.filter((r) => r.embedding.length > 0).length, n)}`
    );
  }

  // Rows carrying nothing but a title embed to almost the same vector as every
  // other bare title, so they are present in the corpus but effectively
  // unmatchable. Worth counting separately from "has no description".
  const thin = entities.filter(
    (e) => !e.description && !e.enrichedText && e.tags.length === 0 && !e.subtitle
  );
  console.log(`\nthin rows (title only, weak retrieval signal): ${thin.length}/${entities.length}`);

  const unembedded = entities.filter((e) => e.embedding.length === 0);
  if (unembedded.length > 0) {
    console.log(`unembedded (invisible to matching): ${unembedded.length}`);
  }

  console.log("\nsample:");
  for (const entity of entities.slice(0, 6)) {
    console.log(`  [${entity.kind}] ${entity.title.slice(0, 60)}`);
    console.log(
      `      loc=${entity.locationName ?? "-"} | tags=${entity.tags.slice(0, 3).join(", ") || "-"}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
