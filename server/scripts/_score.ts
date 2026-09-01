/**
 * Dry-run scorer. Runs a question through the real retrieval pipeline and
 * reports what the attendee would see, WITHOUT writing a Query row -- so
 * probing candidate demo seeds does not pollute the organiser dashboard.
 *
 * Mirrors routes/ask.ts exactly; if that changes, this drifts.
 */
import "dotenv/config";
import { embed } from "../src/ai/llm";
import { prisma } from "../src/db";
import { affiliatedEntityIds, findOrganisations, knownOrganisations } from "../src/match/affiliation";
import { extractFacets, embeddingTextForQuery } from "../src/match/facets";
import { filterCandidates } from "../src/match/filter";
import { rankCandidates } from "../src/match/rank";
import { retrieveCandidates } from "../src/match/retrieve";
import { normaliseLevel, preferredKinds } from "../src/match/types";

const STRONG = 0.42;
const FLOOR = 0.33;

async function main() {
  const questions = process.argv.slice(2);
  const event = await prisma.event.findUnique({ where: { slug: "api-world-2026" } });
  if (!event) throw new Error("no event");
  const orgs = await knownOrganisations(event.id);

  for (const text of questions) {
    const facets = await extractFacets(text);
    const [queryVector] = await embed([embeddingTextForQuery(text, facets)]);
    const affiliated = await affiliatedEntityIds(event.id, findOrganisations(text, orgs));
    const preferred =
      preferredKinds(facets.seeking) ?? (affiliated.size > 0 ? (["PERSON"] as const).slice() : null);
    const retrieved = await retrieveCandidates(event.id, queryVector, {
      ensureKinds: preferred ?? undefined,
      ensureIds: affiliated,
    });
    const now = new Date();
    const filtered = filterCandidates({
      candidates: retrieved,
      now,
      attendeeLevel: normaliseLevel(facets.seeking ?? null),
      pass: null,
    });
    const scored = rankCandidates(filtered.kept, now, preferred, affiliated);
    const top = scored[0]?.score ?? 0;
    const verdict = top >= STRONG ? "ANSWERED" : top >= FLOOR ? "WEAK    " : "UNMET   ";
    console.log(`${verdict} ${top.toFixed(3)}  intent=${facets.intent ?? "?"}  domain=${facets.domain ?? "-"}`);
    console.log(`   Q: ${text}`);
    for (const s of scored.slice(0, 2)) {
      console.log(`   -> ${s.score.toFixed(3)} [${s.kind}] ${s.title.slice(0, 64)}`);
    }
    console.log();
  }
}
main()
  .catch(e => { console.error(String(e).split("\n").slice(0, 4).join("\n")); process.exit(1); })
  .finally(() => prisma.$disconnect());
