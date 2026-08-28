import "dotenv/config";
import { prisma } from "../src/db";
import { embedEntities } from "../src/ingest/embed";

async function main() {
  const result = await embedEntities(process.argv[2] ?? "api-world-2026");
  console.log(`embedded ${result.embedded}, unchanged ${result.skipped}, failed ${result.failed}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
