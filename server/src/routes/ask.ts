import { Router } from "express";
import { z } from "zod";
import type { AskResponse, LinkedEntity, RecommendedEntity } from "@orbit/shared";
import { embed } from "../ai/llm";
import { prisma } from "../db";
import { AppError } from "../errors";
import { extractFacets, embeddingTextForQuery } from "../match/facets";
import { explainRecommendations } from "../match/explain";
import { filterCandidates } from "../match/filter";
import { rankCandidates, reserveForPreferredKinds } from "../match/rank";
import { retrieveCandidates } from "../match/retrieve";
import { normaliseLevel, preferredKinds } from "../match/types";
import { asyncHandler } from "../middleware/asyncHandler";
import type { DeviceRequest } from "../middleware/device";

export const askRouter = Router();

/** How many recommendations reach the screen. */
const SHOWN = 5;

/**
 * Below this similarity nothing is worth showing.
 *
 * A conference corpus is small and an attendee's problem may genuinely not be
 * represented in it. Returning the five least-bad rows in that case is worse
 * than saying so: it burns the trust that makes the good answers useful, and
 * sends someone to a session that has nothing to do with them.
 */
const SCORE_FLOOR = 0.2;

const askSchema = z.object({
  eventSlug: z.string().min(1),
  text: z.string().min(1).max(2000),
});

askRouter.post(
  "/",
  asyncHandler(async (req: DeviceRequest, res) => {
    const { eventSlug, text } = askSchema.parse(req.body);

    const event = await prisma.event.findUnique({ where: { slug: eventSlug } });
    if (!event) {
      throw new AppError(`No event named "${eventSlug}".`, {
        statusCode: 404,
        code: "EVENT_NOT_FOUND",
      });
    }

    // Facets and the query embedding are independent of each other only in
    // principle -- the embedding text is built *from* the facets, so this stays
    // sequential.
    const facets = await extractFacets(text);
    const [queryVector] = await embed([embeddingTextForQuery(text, facets)]);

    const preferred = preferredKinds(facets.seeking);

    // Preference is applied at retrieval as well as at ranking. Ranking can
    // only reorder what it is given, and for a topical question the top of the
    // similarity list is entirely sessions.
    const retrieved = await retrieveCandidates(event.id, queryVector, {
      ensureKinds: preferred ?? undefined,
    });

    // An empty retrieval means the corpus has no embeddings, not that the
    // question was bad. Saying so plainly beats an empty list that looks like
    // a considered answer.
    if (retrieved.length === 0) {
      throw new AppError(
        "This event has no searchable sessions yet. Check back once its programme is loaded.",
        { statusCode: 503, code: "CORPUS_NOT_READY" }
      );
    }

    const now = new Date();
    const filtered = filterCandidates({
      candidates: retrieved,
      now,
      // Level is only applied when the attendee placed themselves. Most people
      // describe a problem, not a seniority, so this is usually absent.
      attendeeLevel: normaliseLevel(facets.seeking ?? null),
    });

    const scored = rankCandidates(filtered.kept, now, preferred).filter(
      (candidate) => candidate.score >= SCORE_FLOOR
    );

    // Reservation happens after the floor, so a preference can promote a decent
    // match but never manufacture one.
    const ranked = reserveForPreferredKinds(scored, preferred, SHOWN).slice(0, SHOWN);

    const corpusMiss = ranked.length === 0;

    // Descriptions and links are fetched only for what survived ranking --
    // pulling them for the whole corpus would be most of a megabyte to throw
    // away.
    const detail = await prisma.entity.findMany({
      where: { id: { in: ranked.map((candidate) => candidate.id) } },
      select: {
        id: true,
        description: true,
        enrichedText: true,
        subtitle: true,
        outgoing: {
          select: {
            kind: true,
            to: { select: { id: true, kind: true, title: true, subtitle: true, locationName: true } },
          },
        },
        incoming: {
          select: {
            kind: true,
            from: { select: { id: true, kind: true, title: true, subtitle: true, locationName: true } },
          },
        },
      },
    });

    const detailById = new Map(detail.map((row) => [row.id, row]));
    const descriptions = new Map(
      detail.map((row) => [row.id, row.description ?? row.enrichedText ?? null])
    );

    // Speakers are handed to the explainer explicitly. Without them it invented
    // attributions -- crediting three unrelated sessions to whichever speaker
    // appeared first in the prompt.
    const speakers = new Map<string, string[]>(
      detail.map((row) => [
        row.id,
        [
          ...row.incoming.filter((l) => l.kind === "SPEAKS_AT").map((l) => l.from.title),
          ...row.outgoing.filter((l) => l.kind === "SPEAKS_AT").map((l) => l.to.title),
        ],
      ])
    );

    const reasons = corpusMiss
      ? new Map<string, string>()
      : await explainRecommendations({
          rawText: text,
          facets,
          candidates: ranked,
          descriptions,
          speakers,
        });

    const query = await prisma.query.create({
      data: {
        eventId: event.id,
        // Anonymous, and never joined to a person. Absent for a caller that
        // sent no header -- the question is still worth recording, because the
        // aggregate of what attendees needed is the organizer-facing product.
        deviceId: req.deviceId ?? "anonymous",
        rawText: text,
        structured: facets,
        embedding: queryVector,
        askedAt: now,
        recommendations: {
          create: ranked.map((candidate) => ({
            entityId: candidate.id,
            rank: candidate.rank,
            score: candidate.score,
            reason: reasons.get(candidate.id) ?? "",
          })),
        },
      },
    });

    const recommendations: RecommendedEntity[] = ranked.map((candidate) => {
      const row = detailById.get(candidate.id);

      const linked: LinkedEntity[] = [
        ...(row?.outgoing ?? []).map((link) => ({ ...link.to, relation: link.kind })),
        ...(row?.incoming ?? []).map((link) => ({ ...link.from, relation: link.kind })),
      ];

      return {
        id: candidate.id,
        kind: candidate.kind,
        title: candidate.title,
        subtitle: row?.subtitle ?? null,
        description: row?.description ?? null,
        locationName: candidate.locationName,
        startsAt: candidate.startsAt?.toISOString() ?? null,
        endsAt: candidate.endsAt?.toISOString() ?? null,
        rank: candidate.rank,
        reason: reasons.get(candidate.id) ?? "",
        linked,
      };
    });

    const body: AskResponse = {
      queryId: query.id,
      recommendations,
      diagnostics: {
        endedCount: filtered.endedCount,
        levelFilteredCount: filtered.levelFilteredCount,
        corpusMiss,
      },
    };

    res.json(body);
  })
);
