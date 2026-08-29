import "dotenv/config";
import { prisma } from "../src/db";

// A one-off migration, not ongoing logic.
//
// The model tier read the schedule page's track lists as if they were session
// titles, producing entities like "AI Ops & Infra" and "APIs in the Age of AI |
// API AI & Innovation Summit | Model Context Protocol (M". Those are taxonomy,
// not sessions, and now that the same sessions come from Sessionize with real
// titles the artifacts are pure noise -- they carry no room, no time and no
// description, and they compete for the same five slots.
//
// Five rules, each provable against the organizer's own data rather than
// guessed at:
//   1. A title containing " | " is a track list. Sessions do not have pipes.
//   2. A title matching one of the event's category names is a track, because
//      that is where the string came from.
//   3. A title that is a strict prefix of a real Sessionize title is a chunk
//      boundary cutting a session in half -- "AI TechWorld Roundtable" against
//      "AI TechWorld Roundtable: Ayan Gupta, Cloud Advocate, Microsoft".
//   4. A title matching a Sessionize service session is logistics. Nobody needs
//      to be recommended registration.
//   5. A title starting mid-word is the other half of a chunk boundary:
//      "orkloads in the Cloud", "ps and Integration".
//
// Anything else is left alone. Tier 2 genuinely found sessions Sessionize does
// not list -- "Are You in the Dark? How Open-Source Is Making AI Agent
// Decisions Explainable" is real and absent from the API -- and deleting those
// to tidy up would lose real programme.

const SESSIONIZE_ALL = "https://sessionize.com/api/v2/zctro3uq/view/All";

async function main() {
  const apply = process.argv.includes("--apply");
  const slug = "api-world-2026";

  const payload = (await (await fetch(SESSIONIZE_ALL)).json()) as {
    categories: { items: { name: string }[] }[];
    sessions: { title: string; isServiceSession: boolean }[];
  };
  const categoryNames = new Set(
    payload.categories.flatMap((c) => c.items.map((i) => i.name.trim().toLowerCase()))
  );
  const realTitles = payload.sessions.map((s) => s.title.trim().toLowerCase());
  const serviceTitles = new Set(
    payload.sessions.filter((s) => s.isServiceSession).map((s) => s.title.trim().toLowerCase())
  );

  const isTruncation = (title: string): boolean => {
    const t = title.trim().toLowerCase();
    return realTitles.some((real) => real !== t && real.startsWith(t));
  };

  // A session title starts with a capital, a digit or a quote. One starting
  // with a lowercase letter was cut out of the middle of a word.
  const startsMidWord = (title: string): boolean => /^[a-z]/.test(title.trim());

  const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
  const candidates = await prisma.entity.findMany({
    where: { eventId: event.id, retiredAt: null, kind: "TALK" },
    select: { id: true, title: true, sourceUrl: true, startsAt: true, description: true },
  });

  const artifacts = candidates.filter(
    (e) =>
      !e.sourceUrl?.includes("sessionize.com") &&
      (e.title.includes(" | ") ||
        categoryNames.has(e.title.trim().toLowerCase()) ||
        serviceTitles.has(e.title.trim().toLowerCase()) ||
        isTruncation(e.title) ||
        startsMidWord(e.title))
  );

  console.log(`${artifacts.length} artifacts of ${candidates.length} talks\n`);
  for (const a of artifacts.slice(0, 40)) console.log(`  ${a.title.slice(0, 76)}`);

  const survivors = candidates.filter(
    (e) => !e.sourceUrl?.includes("sessionize.com") && !artifacts.includes(e)
  );
  console.log(`\n${survivors.length} non-Sessionize talks kept:`);
  for (const s of survivors.slice(0, 20)) console.log(`  ${s.title.slice(0, 76)}`);

  if (!apply) {
    console.log("\n(dry run — pass --apply to retire the artifacts)");
    return;
  }

  const now = new Date();
  const result = await prisma.entity.updateMany({
    where: { id: { in: artifacts.map((a) => a.id) } },
    data: { retiredAt: now },
  });
  console.log(`\nretired ${result.count}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
