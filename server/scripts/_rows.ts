import "dotenv/config";
import { prisma } from "../src/db";
async function main() {
  const ev = await prisma.event.findUnique({ where: { slug: "api-world-2026" } });
  if (!ev) throw new Error("no event");
  const rows = await prisma.query.findMany({
    where: { eventId: ev.id },
    orderBy: { askedAt: "asc" },
    select: { id: true, deviceId: true, rawText: true, askedAt: true },
  });
  for (const r of rows) {
    const demo = r.deviceId.startsWith("demo-");
    console.log(`${demo ? "SEED" : "JUNK"} ${r.deviceId.padEnd(18)} ${r.askedAt.toISOString().slice(5, 16)}  ${r.rawText.slice(0, 58)}`);
  }
  console.log(`\n${rows.length} total, ${rows.filter(r => !r.deviceId.startsWith("demo-")).length} not from the seed`);
}
main().catch(e => console.error(String(e).split("\n").slice(0, 3).join("\n"))).finally(() => prisma.$disconnect());
