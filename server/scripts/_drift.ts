import "dotenv/config";
import { prisma } from "../src/db";
async function main() {
  const feed = await (await fetch("https://sessionize.com/api/v2/zctro3uq/view/All")).json() as any;
  const live = new Map<string, any>((feed.sessions || []).map((s: any) => [s.title.trim(), s]));
  const ev = await prisma.event.findUniqueOrThrow({ where: { slug: "api-world-2026" } });
  const ours = await prisma.entity.findMany({
    where: { eventId: ev.id, kind: "TALK", retiredAt: null },
    select: { title: true },
  });
  const mine = new Set(ours.map(o => o.title.trim()));

  const added = [...live.keys()].filter(t => !mine.has(t));
  const gone = [...mine].filter(t => !live.has(t));
  console.log(`live feed ${live.size} sessions · our corpus ${mine.size} talks`);
  console.log(`\nin the feed but not in our corpus: ${added.length}`);
  for (const t of added.slice(0, 12)) console.log(`  + ${t.slice(0, 68)}`);
  console.log(`\nin our corpus but no longer in the feed: ${gone.length}`);
  for (const t of gone.slice(0, 8)) console.log(`  - ${t.slice(0, 68)}`);
}
main().catch(e => console.error(String(e).split("\n").slice(0, 3).join("\n"))).finally(() => prisma.$disconnect());
