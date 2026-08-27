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

export function createGenericAdapter(eventWindow: {
  startsAt: Date;
  endsAt: Date;
}): IngestAdapter {
  return {
    name: "generic-llm",
    supports: () => true,

    async collect(source: IngestSource): Promise<ExtractedEntity[]> {
      const text = await renderPageText(source.url);
      const chunks = chunkText(text);
      console.log(`  rendered ${text.length} chars -> ${chunks.length} chunk(s)`);

      const collected: ExtractedEntity[] = [];

      // Sequential, not Promise.all. Featherless plans cap concurrent requests,
      // and a burst of parallel chunk extractions is the fastest way to turn a
      // working ingest into a wall of 429s partway through a corpus.
      for (const [index, chunk] of chunks.entries()) {
        try {
          const entities = await extractEntities({
            text: chunk,
            sourceUrl: source.url,
            hint: source.hint,
            eventWindow,
          });
          console.log(`  chunk ${index + 1}/${chunks.length}: ${entities.length} entities`);
          collected.push(...entities);
        } catch (error) {
          // One bad chunk must not lose the other twenty. Extraction failure is
          // usually a model returning prose on a page section that had no
          // entities in it anyway.
          console.warn(
            `  chunk ${index + 1}/${chunks.length} failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      return dedupe(collected);
    },
  };
}
