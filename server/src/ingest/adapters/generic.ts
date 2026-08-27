import { mapWithLimit } from "../concurrency";
import { extractEntities } from "../extract";
import { chunkText, renderPageText } from "../fetch";
import type { ExtractedEntity, IngestAdapter, IngestSource } from "../types";

// Tier 2. Renders any public page and extracts entities from its text.
//
// `supports` returns true unconditionally because this is the fallback of last
// resort -- the adapter registry tries platform adapters first and only reaches
// this one when no structured source is available.

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Chunks overlap, so the same session frequently gets extracted twice. Keeping
 * the higher-confidence copy is not arbitrary: the duplicate that straddled a
 * chunk boundary is precisely the one likely to be missing its room or time,
 * and it reports its own uncertainty about that.
 */
function dedupe(entities: ExtractedEntity[]): ExtractedEntity[] {
  const best = new Map<string, ExtractedEntity>();

  for (const entity of entities) {
    const key = `${entity.kind}:${normaliseTitle(entity.title)}`;
    const existing = best.get(key);
    if (!existing || entity.confidence > existing.confidence) {
      best.set(key, entity);
    }
  }

  return [...best.values()];
}

/**
 * How many chunks are extracted at once.
 *
 * This was 1 for a reason that no longer holds. Featherless charges each model
 * a `concurrency_cost` against a plan-wide ceiling, and the previous model cost
 * 4 units against a limit of 4 -- the account could physically run one request
 * at a time, so any parallelism here was an immediate 429.
 *
 * At cost 1 there are four slots. Three are used rather than four: the fourth
 * is left for whatever else touches the provider -- a running server, a second
 * ingest, someone testing a prompt -- because saturating the plan makes an
 * unrelated request fail rather than merely making this one slower.
 *
 * Re-check this when changing FEATHERLESS_MODEL. A cost-2 model has two slots,
 * not four, and this constant does not know that.
 */
const CHUNK_CONCURRENCY = 3;

export function createGenericAdapter(
  eventWindow: { startsAt: Date; endsAt: Date },
  options: { refresh?: boolean } = {}
): IngestAdapter {
  return {
    name: "generic-llm",
    supports: () => true,

    async collect(source: IngestSource): Promise<ExtractedEntity[]> {
      const text = await renderPageText(source.url, { refresh: options.refresh });
      const chunks = chunkText(text);
      console.log(`  rendered ${text.length} chars -> ${chunks.length} chunk(s)`);

      const perChunk = await mapWithLimit(chunks, CHUNK_CONCURRENCY, async (chunk, index) => {
        try {
          const entities = await extractEntities({
            text: chunk,
            sourceUrl: source.url,
            hint: source.hint,
            eventWindow,
          });
          console.log(`  chunk ${index + 1}/${chunks.length}: ${entities.length} entities`);
          return entities;
        } catch (error) {
          // One bad chunk must not lose the other twenty. Caught per chunk
          // rather than around the pool, because Promise.all semantics would
          // let a single failure discard every sibling result already in
          // flight.
          console.warn(
            `  chunk ${index + 1}/${chunks.length} failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [] as ExtractedEntity[];
        }
      });

      return dedupe(perChunk.flat());
    },
  };
}
