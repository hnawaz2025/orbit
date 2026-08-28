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

/** Ten per source, so removing one is 10% and stays under the retirement ceiling. */
const SET_A = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];

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

  const fromA = (titles: string[]) => titles.map((t) => talk(t, SOURCE_A));
  const withB = (titles: string[]) => [...fromA(titles), talk("Omega", SOURCE_B)];
  const sorted = (titles: string[]) => [...titles].sort();

  // Run 1: the full programme.
  let result = await persistEntities(SLUG, withB(SET_A), {
    reconcileSources: [SOURCE_A, SOURCE_B],
  });
  check("run 1 retires nothing", result.retired, 0);
  check("run 1 corpus", await liveTitles(), sorted([...SET_A, "Omega"]));

  // Run 2: Beta is absent for the first time. One miss is not evidence -- a
  // model-tier extraction drops entities at random -- so nothing retires yet.
  const minusBeta = SET_A.filter((t) => t !== "Beta");
  result = await persistEntities(SLUG, withB(minusBeta), {
    reconcileSources: [SOURCE_A, SOURCE_B],
  });
  check("a single miss retires nothing", result.retired, 0);
  check("it is still in the corpus", await liveTitles(), sorted([...SET_A, "Omega"]));

  // Run 3: absent again. Two consecutive misses is real evidence of removal.
  result = await persistEntities(SLUG, withB(minusBeta), {
    reconcileSources: [SOURCE_A, SOURCE_B],
  });
  check("a second consecutive miss retires it", result.retired, 1);
  check("the corpus excludes it", await liveTitles(), sorted([...minusBeta, "Omega"]));

  // A flapping entity -- missing, present, missing -- must never retire, which
  // is exactly the shape extraction variance takes.
  await persistEntities(SLUG, withB(SET_A), { reconcileSources: [SOURCE_A, SOURCE_B] });
  const minusGamma = SET_A.filter((t) => t !== "Gamma");
  await persistEntities(SLUG, withB(minusGamma), { reconcileSources: [SOURCE_A, SOURCE_B] });
  result = await persistEntities(SLUG, withB(SET_A), { reconcileSources: [SOURCE_A, SOURCE_B] });
  check("an entity that flaps is never retired", result.retired, 0);
  check("flapping corpus intact", await liveTitles(), sorted([...SET_A, "Omega"]));

  // Source B failed to fetch, so only A is reconciled. Omega must
  // survive despite not appearing -- one 404 must not empty the corpus.
  result = await persistEntities(SLUG, fromA(SET_A), { reconcileSources: [SOURCE_A] });
  check("a failed source retires nothing", result.retired, 0);
  check("its entities survive", await liveTitles(), sorted([...SET_A, "Omega"]));

  // A half-empty extraction. Well over the ceiling, so it must be read
  // as a bad run rather than a cancelled programme, and retire nothing.
  result = await persistEntities(SLUG, fromA(SET_A.slice(0, 4)), {
    reconcileSources: [SOURCE_A],
  });
  check("a mass disappearance retires nothing", result.retired, 0);
  check("the corpus survives a bad extraction", await liveTitles(), sorted([...SET_A, "Omega"]));

  // A reinstated session comes back, keeping its embedding and links.
  await persistEntities(SLUG, fromA(minusBeta), { reconcileSources: [SOURCE_A] });
  await persistEntities(SLUG, fromA(minusBeta), { reconcileSources: [SOURCE_A] });
  result = await persistEntities(SLUG, fromA(SET_A), { reconcileSources: [SOURCE_A] });
  check("a reinstated session is revived", result.revived, 1);
  check("final corpus", await liveTitles(), sorted([...SET_A, "Omega"]));

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
