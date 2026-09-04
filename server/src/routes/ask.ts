import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { PASS_TIERS, type AskResponse, type LinkedEntity, type RecommendedEntity } from "@orbit/shared";
import { embed } from "../ai/llm";
import { prisma } from "../db";
import { loadEnv } from "../env";
import { AppError } from "../errors";
import { affiliatedEntityIds, findOrganisations, knownOrganisations } from "../match/affiliation";
import { extractFacets, embeddingTextForQuery } from "../match/facets";
import { explainRecommendations } from "../match/explain";
import { filterCandidates } from "../match/filter";
import { rankCandidates, reserveForPreferredKinds } from "../match/rank";
import { isStillToCome } from "../match/upcoming";
import { retrieveCandidates } from "../match/retrieve";
import { normaliseLevel, preferredKinds } from "../match/types";
import { asyncHandler } from "../middleware/asyncHandler";
import type { DeviceRequest } from "../middleware/device";

const env = loadEnv();

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
 *
 * Calibrated rather than guessed. Against this corpus, questions the
 * conference genuinely covers score 0.442-0.614 at rank one; questions it does
 * not -- Postgres scaling, Kubernetes operators, salary negotiation, espresso
 * machines -- score 0.232-0.350. The gap between those two bands is where
 * these constants sit.
 *
 * The previous value was 0.20, which nothing ever failed to clear, so weak
 * matches always filled all five slots and corpusMiss was unreachable code.
 */
const SCORE_FLOOR = 0.33;

/**
 * Above this, the corpus genuinely has something to say about the question.
 *
 * Below it there may still be rows worth showing -- adjacent sessions, a
 * speaker in the right field -- but presenting them as answers would overclaim.
 * The client is told, and says so.
 */
const STRONG_MATCH = 0.42;

const askSchema = z.object({
  eventSlug: z.string().min(1),
  text: z.string().min(1).max(2000),
  pass: z.enum(PASS_TIERS).optional(),
});

askRouter.post(
  "/",
  asyncHandler(async (req: DeviceRequest, res) => {
    const { eventSlug, text, pass } = askSchema.parse(req.body);

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
    // The off switch. See the note on OPENAI_API_KEY in env.ts: no key means
    // the event is over and the meter is closed, which is a different thing
    // from a broken server and is worth saying differently.
    if (!env.OPENAI_API_KEY) {
      throw new AppError(
        "Orbit is closed for this event. The programme is still here to browse, but asking new questions is switched off.",
        { statusCode: 503, code: "ASKING_CLOSED" }
      );
    }

    const facets = await extractFacets(text);
    const [queryVector] = await embed([embeddingTextForQuery(text, facets)]);

    // Deterministic, and matched only against companies the corpus already
    // knows about -- so this cannot fire on ordinary prose, and needs no extra
    // model call.
    const organisations = findOrganisations(text, await knownOrganisations(event.id));
    const affiliated = await affiliatedEntityIds(event.id, organisations);

    // Naming a company is itself a request for people. The facet extractor
    // often leaves `seeking` empty on these ("tell me people from Google" came
    // back as stack: ["Google"] and nothing else), so the preference is
    // inferred here rather than depending on it.
    const preferred =
      preferredKinds(facets.seeking) ?? (affiliated.size > 0 ? (["PERSON"] as const).slice() : null);

    // Preference is applied at retrieval as well as at ranking. Ranking can
    // only reorder what it is given, and for a topical question the top of the
    // similarity list is entirely sessions.
    const retrieved = await retrieveCandidates(event.id, queryVector, {
      ensureKinds: preferred ?? undefined,
      ensureIds: affiliated,
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
      pass,
    });

    const scored = rankCandidates(filtered.kept, now, preferred, affiliated).filter(
      (candidate) => candidate.score >= SCORE_FLOOR
    );

    // Reservation happens after the floor, so a preference can promote a decent
    // match but never manufacture one.
    const ranked = reserveForPreferredKinds(scored, preferred, SHOWN).slice(0, SHOWN);

    const corpusMiss = ranked.length === 0;

    // Judged on the best score in the set, not on whatever ended up at rank 1.
    // Reservation deliberately promotes a person above better-scoring sessions
    // when someone asked to meet people, so reading ranked[0] made every such
    // question look like a weak match and painted the caveat over five good
    // answers.
    //
    // Still the best rather than the average: one genuinely good answer makes
    // a response useful even when the rest are adjacent.
    const bestScore = scored[0]?.score ?? 0;
    const weakMatch = !corpusMiss && bestScore < STRONG_MATCH;

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
        profileUrl: true,
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
        // Anonymous, and never joined to a person. A caller that sent no
        // header gets a per-question identifier rather than a shared literal:
        // the organizer view counts distinct devices, and collapsing every
        // header-less client into one "anonymous" reported a crowd as a single
        // attendee, in the largest type on the screen.
        deviceId: req.deviceId ?? `anon:${randomUUID()}`,
        rawText: text,
        pass: pass ?? null,
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

      const toLinked = (
        other: {
          id: string; kind: RecommendedEntity["kind"]; title: string;
          subtitle: string | null; locationName: string | null;
          startsAt: Date | null; endsAt: Date | null;
        },
        relation: LinkedEntity["relation"]
      ): LinkedEntity => ({
        id: other.id,
        kind: other.kind,
        title: other.title,
        subtitle: other.subtitle,
        locationName: other.locationName,
        startsAt: other.startsAt?.toISOString() ?? null,
        endsAt: other.endsAt?.toISOString() ?? null,
        relation,
      });

      // Over is over here too.
      //
      // filterCandidates drops a session that has ended, but a person is not
      // time-bound and so is never dropped -- and the sessions hanging off
      // them were not being checked at all. The result, seen live at the
      // conference: a speaker recommended with "catch them at" a talk that
      // finished that morning. The person is still worth meeting; the finished
      // talk is not a way to find them.
      //
      // A link with no end time (a booth, another person) is not expired, it
      // is not time-bound, and stays.
      const linked: LinkedEntity[] = [
        ...(row?.outgoing ?? []).map((link) => toLinked(link.to, link.kind)),
        ...(row?.incoming ?? []).map((link) => toLinked(link.from, link.kind)),
      ].filter((link) => isStillToCome(link.endsAt, now));

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
        profileUrl: row?.profileUrl ?? null,
        linked,
      };
    });

    const body: AskResponse = {
      queryId: query.id,
      // The venue's zone, so the client renders the conference's wall clock
      // rather than the phone's.
      timezone: event.timezone,
      recommendations,
      diagnostics: {
        endedCount: filtered.endedCount,
        levelFilteredCount: filtered.levelFilteredCount,
        passFilteredCount: filtered.passFilteredCount,
        corpusMiss,
        weakMatch,
      },
    };

    res.json(body);
  })
);
