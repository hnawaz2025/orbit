import { Router } from "express";
import { countLabels, type EventInsights, type UnmetQuestion } from "@orbit/shared";
import { prisma } from "../db";
import { AppError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";

export const insightsRouter = Router();

/**
 * The same line the client uses to decide whether to caveat a result set.
 * Kept identical so "weak" means the same thing to an attendee and to an
 * organizer -- otherwise the two halves of the product would disagree about
 * whether a question was answered.
 */
const STRONG_MATCH = 0.42;

/** How many unanswered questions to return. Enough to read, not to skim past. */
const UNMET_LIMIT = 12;

interface Facets {
  goal?: string;
  domain?: string;
  blocker?: string;
  seeking?: string;
}

insightsRouter.get(
  "/:slug/insights",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({ where: { slug: req.params.slug } });
    if (!event) {
      throw new AppError(`No event named "${req.params.slug}".`, {
        statusCode: 404,
        code: "EVENT_NOT_FOUND",
      });
    }

    const queries = await prisma.query.findMany({
      where: { eventId: event.id },
      orderBy: { askedAt: "desc" },
      select: {
        rawText: true,
        structured: true,
        askedAt: true,
        deviceId: true,
        recommendations: { select: { score: true } },
      },
    });

    const facets = queries.map((q) => (q.structured ?? {}) as Facets);

    let answered = 0;
    let weak = 0;
    let unanswered = 0;
    const unmet: UnmetQuestion[] = [];

    for (const query of queries) {
      // Derived rather than stored. The scores are already on the
      // recommendations, and deriving keeps one definition of "answered"
      // rather than a second copy that can drift from the first.
      const best = query.recommendations.reduce((max, r) => Math.max(max, r.score), 0);

      if (query.recommendations.length === 0) {
        unanswered++;
      } else if (best < STRONG_MATCH) {
        weak++;
      } else {
        answered++;
        continue;
      }

      if (unmet.length < UNMET_LIMIT) {
        unmet.push({
          text: query.rawText,
          askedAt: query.askedAt.toISOString(),
          bestScore: Number(best.toFixed(3)),
        });
      }
    }

    // What the corpus is actually being asked to deliver.
    const recommended = await prisma.recommendation.groupBy({
      by: ["entityId"],
      where: { query: { eventId: event.id } },
      _count: { entityId: true },
      orderBy: { _count: { entityId: "desc" } },
      take: 8,
    });

    const entities = await prisma.entity.findMany({
      where: { id: { in: recommended.map((r) => r.entityId) } },
      select: { id: true, title: true, kind: true },
    });
    const byId = new Map(entities.map((e) => [e.id, e]));

    const body: EventInsights = {
      questions: queries.length,
      attendees: new Set(queries.map((q) => q.deviceId)).size,
      answered,
      weak,
      unanswered,
      topDomains: countLabels(facets.map((f) => f.domain)),
      topSeeking: countLabels(facets.map((f) => f.seeking), 5),
      unmet,
      mostRecommended: recommended
        .map((r) => {
          const entity = byId.get(r.entityId);
          return entity
            ? { id: entity.id, title: entity.title, kind: entity.kind, times: r._count.entityId }
            : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    };

    res.json(body);
  })
);
