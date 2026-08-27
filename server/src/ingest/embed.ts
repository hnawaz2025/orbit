import { createHash } from "node:crypto";
import type { Entity } from "@prisma/client";
import { EMBEDDING_MODEL_ID, embed } from "../ai/llm";
import { prisma } from "../db";

// The stage that makes a corpus searchable. Without it every Entity row has an
// empty `embedding` array and retrieval returns nothing, no matter how good the
// extraction was.

/**
 * How many inputs go up per request. The embeddings endpoint takes an array,
 * and one request of 96 is dramatically cheaper in wall-clock than 96 requests
 * -- but an oversized batch is a single point of failure for a large slice of
 * the corpus, and the retry would re-bill every input in it.
 */
const BATCH_SIZE = 96;

/**
 * text-embedding-3-small accepts 8191 tokens. Cutting on characters well under
 * that is deliberate: it costs nothing to be conservative, and the alternative
 * is a whole batch rejected for one long sponsor blurb.
 *
 * Truncation is safe here in a way it would not be for extraction. The leading
 * text of an entity -- title, role, the opening of an abstract -- carries
 * almost all of its retrieval signal, so a clipped tail costs precision, not
 * correctness.
 */
const MAX_CHARS = 8000;

/**
 * The text that represents an entity for retrieval.
 *
 * Enriched text is included rather than embedded separately, because a speaker
 * is one thing to match against, not two. A two-line conference bio and the
 * three paragraphs SerpApi found about the same person should produce a single
 * vector -- searching them independently would let a speaker outrank a talk
 * purely by having more documents.
 *
 * Exported so the match layer can embed a *query* through a comparable path,
 * and so this is unit-testable without a database.
 */
export function embeddingTextFor(
  entity: Pick<Entity, "kind" | "title" | "subtitle" | "description" | "enrichedText" | "tags">
): string {
  const parts = [
    entity.title,
    entity.subtitle,
    entity.description,
    entity.enrichedText,
    // Tags last: they are keywords, and putting them ahead of prose would let a
    // tag list dominate the vector for entities whose description is thin.
    entity.tags.length > 0 ? entity.tags.join(", ") : null,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.join("\n\n").slice(0, MAX_CHARS);
}

/**
 * Identifies the exact text a stored vector was computed from.
 *
 * This is what makes re-running cheap and, more importantly, correct. Ingestion
 * is designed to be run repeatedly, and P2 enrichment rewrites `enrichedText`
 * on rows that already have vectors -- without a content hash those rows would
 * silently keep a vector computed from the pre-enrichment text, which is a
 * corruption that looks exactly like working software.
 */
function sourceHash(text: string): string {
  return createHash("sha256").update(`${EMBEDDING_MODEL_ID}\n${text}`).digest("hex");
}

export interface EmbedResult {
  embedded: number;
  skipped: number;
  failed: number;
}

/**
 * Embed every entity in an event whose vector is missing or stale.
 *
 * Batches fail independently. One rejected batch should cost its own hundred
 * rows and nothing else -- the next run picks them up, because a row is only
 * marked done once its vector is actually written.
 */
export async function embedEntities(
  eventSlug: string,
  options: { force?: boolean } = {}
): Promise<EmbedResult> {
  const event = await prisma.event.findUniqueOrThrow({ where: { slug: eventSlug } });
  const entities = await prisma.entity.findMany({ where: { eventId: event.id } });

  const pending: { id: string; text: string; hash: string }[] = [];
  let skipped = 0;

  for (const entity of entities) {
    const text = embeddingTextFor(entity);
    if (text.trim().length === 0) {
      skipped++;
      continue;
    }

    const hash = sourceHash(text);
    const current = entity.embeddingModel;
    const isFresh =
      !options.force &&
      entity.embedding.length > 0 &&
      // The model id is stored with a hash suffix so a model swap invalidates
      // every vector: mixing two embedding spaces in one corpus produces
      // similarity scores that are quietly meaningless rather than obviously
      // broken.
      current === `${EMBEDDING_MODEL_ID}:${hash.slice(0, 12)}`;

    if (isFresh) {
      skipped++;
      continue;
    }

    pending.push({ id: entity.id, text, hash });
  }

  let embedded = 0;
  let failed = 0;

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const label = `${start + 1}-${start + batch.length} of ${pending.length}`;

    try {
      const vectors = await embed(batch.map((row) => row.text));

      if (vectors.length !== batch.length) {
        throw new Error(`expected ${batch.length} vectors, received ${vectors.length}`);
      }

      // Sequential rather than Promise.all: a few hundred rows is not worth
      // opening a hundred concurrent transactions against a free-tier Postgres.
      for (const [index, row] of batch.entries()) {
        await prisma.entity.update({
          where: { id: row.id },
          data: {
            embedding: vectors[index],
            embeddingModel: `${EMBEDDING_MODEL_ID}:${row.hash.slice(0, 12)}`,
          },
        });
      }

      embedded += batch.length;
      console.log(`  embedded ${label}`);
    } catch (error) {
      failed += batch.length;
      console.warn(
        `  batch ${label} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { embedded, skipped, failed };
}
