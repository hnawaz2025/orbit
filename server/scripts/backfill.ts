import "dotenv/config";
import { prisma } from "../src/db";
import { backfillSpeakers } from "../src/ingest/backfillSpeakers";

async function main() {
  const result = await backfillSpeakers(
    process.argv[2] ?? "api-world-2026",
    "https://apiworld.co/speakers/"
  );
  console.log(`parsed ${result.parsed} speaker lines from the page`);
  console.log(`updated ${result.updated} entities`);
  console.log(`${result.unmatched} parsed names had no matching entity`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
