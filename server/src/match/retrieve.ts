import { prisma } from "../db";
import type { Candidate } from "./types";

// Retrieval: turn a query vector into scored candidates.
//
// Brute-forced in memory, which the schema already commits to and which is the
// right call at this size. A few hundred entities is a few hundred dot products
// of 1536 floats -- roughly a millisecond -- and carrying pgvector to avoid
// that would mean a database extension, a migration path, and an index to tune,
// all to optimise something that is not the bottleneck. The bottleneck is the
// model call that happens either side of this.

/**
 * Cosine similarity of two equal-length vectors.
 *
 * Throws on a length mismatch rather than returning a number. Different lengths
 * mean the two vectors came from different embedding models, and any score
 * computed across that boundary is meaningless -- but meaningless in the worst
 * way, since it still looks like a plausible float and would quietly reorder
 * results instead of failing.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Cannot compare vectors of different lengths (${a.length} vs ${b.length}). ` +
        "This means the corpus was embedded with a different model than the query -- re-run the embed stage."
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // A zero vector has no direction, so it has no similarity to anything. Guard
  // rather than divide -- otherwise this returns NaN, which sorts
  // unpredictably and silently scatters those rows through the results.
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RetrieveOptions {
  /**
   * How many candidates to hand to filtering and ranking.
   *
   * Deliberately larger than the number shown to the user: filtering removes
   * ended sessions after this point, so retrieving exactly as many as we intend
   * to display would return a short list late in the day, precisely when the
   * corpus is thinnest and the attendee most needs the remaining options.
   */
  limit?: number;
}

const DEFAULT_LIMIT = 40;

/**
 * Score every embedded entity in an event against the query vector.
 *
 * Entities with no embedding are skipped rather than scored as zero. An
 * un-embedded row is not a bad match, it is an unknown one, and letting it sit
 * at the bottom of every result set would hide a broken embed stage behind
 * plausible-looking output.
 */
export async function retrieveCandidates(
  eventId: string,
  queryVector: number[],
  options: RetrieveOptions = {}
): Promise<Candidate[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;

  const entities = await prisma.entity.findMany({
    // retiredAt filters entities whose source no longer lists them. This is the
    // only place it has to be right: a retired session that reaches ranking is
    // a real person walking to a room that has no session in it, which is the
    // same failure as a hallucinated one.
    where: { eventId, retiredAt: null },
    include: {
      outgoing: { select: { toId: true } },
      incoming: { select: { fromId: true } },
    },
  });

  const scored: Candidate[] = [];

  for (const entity of entities) {
    if (entity.embedding.length === 0) continue;

    scored.push({
      id: entity.id,
      kind: entity.kind,
      title: entity.title,
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      locationName: entity.locationName,
      level: entity.level,
      isDurable: entity.isDurable,
      similarity: cosineSimilarity(queryVector, entity.embedding),
      // Links are undirected for ranking purposes. A talk that points at its
      // speaker and a speaker pointed at by their talk are the same
      // relationship, and the tie-breaker should see it from either end.
      linkedIds: [
        ...entity.outgoing.map((link) => link.toId),
        ...entity.incoming.map((link) => link.fromId),
      ],
    });
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}
