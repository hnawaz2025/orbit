import "dotenv/config";
import { prisma } from "../src/db";
async function main() {
  const ev = await prisma.event.findUniqueOrThrow({ where: { slug: "api-world-2026" } });
  const talks = await prisma.entity.findMany({
    where: { eventId: ev.id, kind: "TALK", retiredAt: null },
    select: { title: true, startsAt: true, endsAt: true },
  });
  const noEnd = talks.filter(t => !t.endsAt);
  const noStart = talks.filter(t => !t.startsAt);
  const now = new Date();
  const pastByStart = talks.filter(t => t.startsAt && t.startsAt < now);
  const pastNoEnd = noEnd.filter(t => t.startsAt && t.startsAt < now);
  console.log(`${talks.length} talks · no endsAt: ${noEnd.length} · no startsAt: ${noStart.length}`);
  console.log(`already started: ${pastByStart.length} · of those missing endsAt: ${pastNoEnd.length}`);
  for (const t of pastNoEnd.slice(0, 5)) console.log(`  ! ${t.startsAt?.toISOString()} ${t.title.slice(0,52)}`);
}
main().catch(e => console.error(String(e).split("\n").slice(0,3).join("\n"))).finally(() => prisma.$disconnect());
