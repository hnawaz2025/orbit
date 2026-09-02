import { Router } from "express";
import type { EventSummary, LinkedEntity, RecommendedEntity } from "@orbit/shared";
import { prisma } from "../db";
import { isStillToCome } from "../match/upcoming";
import { AppError } from "../errors";
import { asyncHandler } from "../middleware/asyncHandler";

export const eventsRouter = Router();

/** Every event with a corpus. The client uses this to pick which one it is at. */
eventsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const events = await prisma.event.findMany({
      orderBy: { startsAt: "asc" },
      include: { _count: { select: { entities: true } } },
    });

    const body: EventSummary[] = events.map((event) => ({
      slug: event.slug,
      name: event.name,
      venue: event.venue,
      timezone: event.timezone,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      entityCount: event._count.entities,
    }));

    res.json(body);
  })
);

/**
 * One entity, in the shape a recommendation card understands.
 *
 * Exists so a linked speaker can be opened. Without it the session-to-person
 * path -- the thing that makes this more than a schedule browser -- was drawn
 * on every card and led nowhere.
 *
 * `reason` is empty here, and honestly so: a reason is generated for a
 * particular question, and there is no question in this request. Fabricating
 * one would be inventing the single field the product is judged on.
 */
eventsRouter.get(
  "/:slug/entities/:id",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({ where: { slug: req.params.slug } });
    if (!event) {
      throw new AppError(`No event named "${req.params.slug}".`, {
        statusCode: 404,
        code: "EVENT_NOT_FOUND",
      });
    }

    const entity = await prisma.entity.findFirst({
      where: { id: req.params.id, eventId: event.id, retiredAt: null },
      include: {
        outgoing: {
          select: {
            kind: true,
            to: {
              select: {
                id: true, kind: true, title: true, subtitle: true,
                locationName: true, startsAt: true, endsAt: true,
              },
            },
          },
        },
        incoming: {
          select: {
            kind: true,
            from: {
              select: {
                id: true, kind: true, title: true, subtitle: true,
                locationName: true, startsAt: true, endsAt: true,
              },
            },
          },
        },
      },
    });

    if (!entity) {
      throw new AppError("That is no longer part of this conference.", {
        statusCode: 404,
        code: "ENTITY_NOT_FOUND",
      });
    }

    const linked: LinkedEntity[] = [
      ...entity.outgoing.map((link) => ({
        ...link.to,
        startsAt: link.to.startsAt?.toISOString() ?? null,
        endsAt: link.to.endsAt?.toISOString() ?? null,
        relation: link.kind,
      })),
      ...entity.incoming.map((link) => ({
        ...link.from,
        startsAt: link.from.startsAt?.toISOString() ?? null,
        endsAt: link.from.endsAt?.toISOString() ?? null,
        relation: link.kind,
      })),
      // Sessions that have already ended are dropped, exactly as in /ask.
      // This route backs the detail screen, so without it the finished talk
      // that /ask now hides reappears the moment someone taps through to the
      // speaker. A link with no end time is not time-bound and stays.
    ].filter((link) => isStillToCome(link.endsAt, new Date()));

    const body: RecommendedEntity & { timezone: string } = {
      id: entity.id,
      kind: entity.kind,
      title: entity.title,
      subtitle: entity.subtitle,
      description: entity.description ?? entity.enrichedText,
      locationName: entity.locationName,
      startsAt: entity.startsAt?.toISOString() ?? null,
      endsAt: entity.endsAt?.toISOString() ?? null,
      rank: 0,
      reason: "",
      profileUrl: entity.profileUrl,
      linked,
      timezone: event.timezone,
    };

    res.json(body);
  })
);

eventsRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { slug: req.params.slug },
      include: { _count: { select: { entities: true } } },
    });

    // A 404 with a written message rather than a bare status: the only way a
    // client reaches this is a stale slug, and saying so is more useful than
    // an empty body.
    if (!event) {
      throw new AppError(`No event named "${req.params.slug}".`, {
        statusCode: 404,
        code: "EVENT_NOT_FOUND",
      });
    }

    const body: EventSummary = {
      slug: event.slug,
      name: event.name,
      venue: event.venue,
      timezone: event.timezone,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      entityCount: event._count.entities,
    };

    res.json(body);
  })
);
