import "dotenv/config";
import { prisma } from "../src/db";
async function main() {
  const ev = await prisma.event.findUnique({ where: { slug: "api-world-2026" } });
  if (!ev) throw new Error("no event");
  const doomed = await prisma.query.findMany({
    where: { eventId: ev.id, NOT: { deviceId: { startsWith: "demo-" } } },
    select: { id: true, rawText: true },
  });
  console.log(`deleting ${doomed.length} rows not written by the seed:`);
  for (const d of doomed) console.log(`  - ${d.rawText.slice(0, 62)}`);
  const res = await prisma.query.deleteMany({
    where: { eventId: ev.id, NOT: { deviceId: { startsWith: "demo-" } } },
  });
  const left = await prisma.query.count({ where: { eventId: ev.id } });
  console.log(`\ndeleted ${res.count}; ${left} remain`);
}
main().catch(e => console.error(String(e).split("\n").slice(0, 3).join("\n"))).finally(() => prisma.$disconnect());
