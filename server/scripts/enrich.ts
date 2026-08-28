import "dotenv/config";
import { prisma } from "../src/db";
import { enrichEntities } from "../src/ingest/enrich";

// npm run enrich -- <event-slug> [--limit N]
//
// Separate from ingest on purpose. Enrichment spends a metered external budget
// (250 searches a month on the free plan) where extraction spends time, so it
// should be run deliberately and in measured batches rather than every time
// someone re-runs a prompt change.

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((arg) => !arg.startsWith("--")) ?? "api-world-2026";
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

  console.log(`Enriching ${slug}${limit ? ` (limit ${limit})` : ""}\n`);

  const result = await enrichEntities(slug, { limit });

  console.log("---");
  console.log(`enriched:     ${result.enriched}`);
  console.log(`unconfirmed:  ${result.unconfirmed}  (results did not corroborate the subject)`);
  console.log(`ambiguous:    ${result.ambiguous}  (nothing to identify them by — left alone)`);
  console.log(`searches used: ${result.searchesUsed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
