import "dotenv/config";
import { prisma } from "../src/db";
import { persistEntities } from "../src/ingest/persist";
import type { ExtractedEntity } from "../src/ingest/types";

// Exercises reconciliation against a real database on a throwaway event.
//
// The safety property is the one worth proving: a source that failed to fetch
// must retire nothing. run.ts continues past a failed source by design, so if
// "not seen this run" were treated as removal unconditionally, one 404 on the
// speakers page would retire every speaker in the corpus.

const SLUG = "__reconcile-test";
const SOURCE_A = "https://example.test/a";
const SOURCE_B = "https://example.test/b";

const talk = (title: string, sourceUrl: string): ExtractedEntity => ({
  kind: "TALK",
  title,
  tags: [],
  confidence: 1,
  sourceUrl,
});

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

async function liveTitles(): Promise<string[]> {
  const event = await prisma.event.findUniqueOrThrow({ where: { slug: SLUG } });
  const rows = await prisma.entity.findMany({
    where: { eventId: event.id, retiredAt: null },
    select: { title: true },
    orderBy: { title: "asc" },
  });
  return rows.map((r) => r.title);
}

async function main() {
  await prisma.event.deleteMany({ where: { slug: SLUG } });
  await prisma.event.create({
    data: {
      slug: SLUG,
      name: "Reconcile Test",
      startsAt: new Date("2026-09-01T08:00:00-07:00"),
      endsAt: new Date("2026-09-03T18:00:00-07:00"),
    },
  });

  // Run 1: three sessions from A, one from B.
  let result = await persistEntities(
    SLUG,
    [talk("Alpha", SOURCE_A), talk("Beta", SOURCE_A), talk("Gamma", SOURCE_A), talk("Delta", SOURCE_B)],
    { reconcileSources: [SOURCE_A, SOURCE_B] }
  );
  check("run 1 retires nothing", result.retired, 0);
  check("run 1 corpus", await liveTitles(), ["Alpha", "Beta", "Delta", "Gamma"]);

  // Run 2: Beta is gone from A. Both sources fetched.
  result = await persistEntities(
    SLUG,
    [talk("Alpha", SOURCE_A), talk("Gamma", SOURCE_A), talk("Delta", SOURCE_B)],
    { reconcileSources: [SOURCE_A, SOURCE_B] }
  );
  check("run 2 retires the removed session", result.retired, 1);
  check("run 2 corpus excludes it", await liveTitles(), ["Alpha", "Delta", "Gamma"]);

  // Run 3: source B failed to fetch, so only A is reconciled. Delta must
  // survive despite not appearing -- this is the property that matters.
  result = await persistEntities(
    SLUG,
    [talk("Alpha", SOURCE_A), talk("Gamma", SOURCE_A)],
    { reconcileSources: [SOURCE_A] }
  );
  check("a failed source retires nothing", result.retired, 0);
  check("its entities survive", await liveTitles(), ["Alpha", "Delta", "Gamma"]);

  // Run 4: Beta comes back.
  result = await persistEntities(
    SLUG,
    [talk("Alpha", SOURCE_A), talk("Beta", SOURCE_A), talk("Gamma", SOURCE_A)],
    { reconcileSources: [SOURCE_A] }
  );
  check("a reinstated session is revived", result.revived, 1);
  check("run 4 corpus", await liveTitles(), ["Alpha", "Beta", "Delta", "Gamma"]);

  await prisma.event.deleteMany({ where: { slug: SLUG } });
  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
