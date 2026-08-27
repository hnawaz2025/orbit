import { Router } from "express";
import type { EventSummary } from "@orbit/shared";
import { prisma } from "../db";
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
