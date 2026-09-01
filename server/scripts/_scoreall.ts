import "dotenv/config";
import { readFileSync } from "node:fs";
import { embed } from "../src/ai/llm";
import { prisma } from "../src/db";
import { affiliatedEntityIds, findOrganisations, knownOrganisations } from "../src/match/affiliation";
import { extractFacets, embeddingTextForQuery } from "../src/match/facets";
import { filterCandidates } from "../src/match/filter";
import { rankCandidates } from "../src/match/rank";
import { retrieveCandidates } from "../src/match/retrieve";
import { normaliseLevel, preferredKinds } from "../src/match/types";

const STRONG = 0.42, FLOOR = 0.33;
type Seed = { device: string; pass: string; role: string; text: string };

async function main() {
  const seeds: Seed[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const from = Number(process.argv[3] ?? 0), to = Number(process.argv[4] ?? seeds.length);
  // Neon's free tier scales to zero and the first connection after that fails
  // outright rather than waiting for the wake-up. Retry rather than die.
  let event = null;
  for (let attempt = 0; attempt < 6 && !event; attempt++) {
    try {
      event = await prisma.event.findUnique({ where: { slug: "api-world-2026" } });
    } catch {
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  if (!event) throw new Error("no event");
  const orgs = await knownOrganisations(event.id);

  for (const [i, seed] of seeds.slice(from, to).entries()) {
    const facets = await extractFacets(seed.text);
    const [v] = await embed([embeddingTextForQuery(seed.text, facets)]);
    const affiliated = await affiliatedEntityIds(event.id, findOrganisations(seed.text, orgs));
    const preferred = preferredKinds(facets.seeking) ?? (affiliated.size > 0 ? (["PERSON"] as const).slice() : null);
    const retrieved = await retrieveCandidates(event.id, v, { ensureKinds: preferred ?? undefined, ensureIds: affiliated });
    const now = new Date();
    const filtered = filterCandidates({ candidates: retrieved, now, attendeeLevel: normaliseLevel(facets.seeking ?? null), pass: seed.pass as never });
    const scored = rankCandidates(filtered.kept, now, preferred, affiliated);
    const top = scored[0];
    const s = top?.score ?? 0;
    const got = s >= STRONG ? "answered" : s >= FLOOR ? "weak" : "unmet";
    const want = seed.role === "person" ? "answered" : seed.role;
    const ok = got === want || (seed.role === "logistics" && facets.intent === "logistics");
    console.log(
      `${ok ? "ok " : "BAD"} ${String(from + i).padStart(2)} ${got.padEnd(8)} ${s.toFixed(3)} ` +
      `want=${seed.role.padEnd(9)} intent=${(facets.intent ?? "?").padEnd(9)} ` +
      `top=[${top?.kind ?? "-"}] ${(top?.title ?? "").slice(0, 40)}`
    );
  }
}
main().catch(e => { console.error(String(e).split("\n").slice(0, 3).join("\n")); process.exit(1); })
  .finally(() => prisma.$disconnect());
