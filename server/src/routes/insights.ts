import { Router } from "express";
import { countLabels, type EventInsights, type UnmetQuestion } from "@orbit/shared";
import { prisma } from "../db";
import { loadEnv } from "../env";
import { AppError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";

const env = loadEnv();

/**
 * The organizer view is gated.
 *
 * Everything here is anonymous -- no names, no device ids, only counts and the
 * text people typed. But it is still every question real attendees asked, and
 * publishing that to anyone who guesses a URL is not a thing to do by
 * accident. Absent configuration fails closed rather than open: forgetting to
 * set the token locks the door rather than removing it.
 */
function requireOrganizer(header: string | undefined): void {
  if (!env.ORGANIZER_TOKEN) {
    throw new AppError("The organiser view is not configured on this server.", {
      statusCode: 503,
      code: "ORGANIZER_VIEW_DISABLED",
    });
  }

  // Length-independent comparison is overkill for a shared demo passcode, but
  // an early-exit compare on a secret is a habit worth not forming.
  const given = header ?? "";
  const expected = env.ORGANIZER_TOKEN;
  let mismatch = given.length === expected.length ? 0 : 1;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    mismatch |= given.charCodeAt(i % (given.length || 1)) ^ expected.charCodeAt(i % expected.length);
  }
  if (mismatch !== 0) {
    throw new AppError("That passcode is not right.", {
      statusCode: 401,
      code: "ORGANIZER_UNAUTHORIZED",
    });
  }
}

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
    requireOrganizer(req.header("x-organizer-token"));

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
