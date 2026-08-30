import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/db";

// A one-off pass over searches already paid for.
//
// enrich.ts kept only the title and snippet of each result and discarded the
// url, so profile links were fetched, cached to disk, and thrown away. The
// cache means recovering them costs nothing -- no new searches against a
// 250-a-month budget.

const CACHE_DIR = path.resolve(__dirname, "../.cache/serpapi");
const PROFILE = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9._-]+/i;

async function main() {
  const apply = process.argv.includes("--apply");
  const event = await prisma.event.findUniqueOrThrow({ where: { slug: "api-world-2026" } });

  const people = await prisma.entity.findMany({
    where: { eventId: event.id, retiredAt: null, kind: "PERSON", subtitle: { not: null } },
    select: { id: true, title: true, subtitle: true, profileUrl: true },
  });

  let found = 0;
  let missing = 0;

  for (const person of people) {
    const employer = person.subtitle?.match(/\s+@\s+(.+)$/)?.[1]?.trim();
    if (!employer) { missing++; continue; }

    // Reconstructed exactly as enrich.ts built it, since the cache is keyed on
    // the query string.
    const query = `"${person.title}" "${employer}"`;
    const file = path.join(CACHE_DIR, `${createHash("sha256").update(query).digest("hex")}.json`);

    let results: { link?: string }[];
    try {
      results = JSON.parse(await readFile(file, "utf8"));
    } catch {
      missing++;
      continue;
    }

    const profile = results.map((r) => r.link ?? "").find((u) => PROFILE.test(u));
    if (!profile) { missing++; continue; }

    found++;
    if (apply && !person.profileUrl) {
      await prisma.entity.update({
        where: { id: person.id },
        data: { profileUrl: profile.match(PROFILE)![0] },
      });
    }
  }

  console.log(`people with an employer: ${people.length}`);
  console.log(`profiles recoverable from cache: ${found}`);
  console.log(`no cached search or no profile in it: ${missing}`);
  if (!apply) console.log("\n(dry run — pass --apply to write them)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
