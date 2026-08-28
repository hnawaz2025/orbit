import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Entity } from "@prisma/client";
import { prisma } from "../db";
import { loadEnv } from "../env";
import { mapWithLimit } from "./concurrency";

// Supplemental context from the public web, for entities the conference page
// describes in a handful of words.
//
// This is not a nice-to-have on this corpus. API World publishes no session
// abstracts anywhere and lists most speakers as a bare name, so 98 of 338
// entities carry nothing but a title -- and a bare name embeds to nearly the
// same vector as every other bare name. Enrichment is what makes half the
// corpus reachable at all.

const CACHE_DIR = path.resolve(__dirname, "../../.cache/serpapi");

/**
 * The free plan allows 250 searches a month at 50 an hour, and we have ~190
 * entities worth enriching. Every decision below is shaped by that: results are
 * cached so iterating costs nothing, work is ordered so the most valuable rows
 * are enriched first, and the budget is an explicit argument rather than
 * something discovered by running out.
 */
const DEFAULT_LIMIT = 40;

/** Two at a time. Well inside the hourly allowance, and polite. */
const CONCURRENCY = 2;

export interface EnrichResult {
  enriched: number;
  /** Skipped because we could not confirm the results were about them. */
  unconfirmed: number;
  /** Skipped because there was nothing to disambiguate them by. */
  ambiguous: number;
  searchesUsed: number;
}

interface SerpResult {
  title?: string;
  snippet?: string;
  link?: string;
}

async function cachedSearch(query: string, apiKey: string): Promise<SerpResult[]> {
  const cacheFile = path.join(
    CACHE_DIR,
    `${createHash("sha256").update(query).digest("hex")}.json`
  );

  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    // Cache miss is the normal first-run path.
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);
  const body = (await response.json()) as {
    error?: string;
    organic_results?: SerpResult[];
  };

  if (body.error) throw new Error(`SerpApi: ${body.error}`);

  const results = (body.organic_results ?? []).map(({ title, snippet, link }) => ({
    title,
    snippet,
    link,
  }));

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(results), "utf8");
  return results;
}

/**
 * What we search for, and what proves the answer is about the right subject.
 *
 * The disambiguator is the load-bearing part. "Anil Inamdar" alone returns
 * whichever Anil Inamdar the web likes best, and attaching a stranger's
 * credentials to a speaker card is precisely the failure that makes an attendee
 * distrust every other card on the screen. So an entity with nothing to
 * distinguish it is left alone rather than enriched on a guess -- a thin row is
 * a weak match, a wrong row is a lie.
 */
function buildQuery(
  entity: Entity,
  linkedTitles: string[]
): { query: string; confirm: string } | null {
  if (entity.kind === "ORG" || entity.kind === "BOOTH") {
    // A company name is its own disambiguator, and the thing we want to know --
    // what they actually ship -- is what the top results are about.
    return { query: `${entity.title} company product`, confirm: entity.title };
  }

  if (entity.kind !== "PERSON") return null;

  // Preferred: the employer, straight off the conference's own listing.
  const employer = entity.subtitle?.split(/\s+@\s+|\s+at\s+/i).pop()?.trim();
  if (employer && employer.length > 2) {
    return { query: `"${entity.title}" ${employer}`, confirm: employer };
  }

  // Fallback: the subject of a talk they are giving. Weaker, but still a claim
  // the right person's web presence should corroborate.
  const topic = linkedTitles[0];
  if (topic) {
    return { query: `"${entity.title}" ${topic.split(/[:—-]/)[0].trim()}`, confirm: entity.title };
  }

  return null;
}

/**
 * Require the results to corroborate the thing we searched on.
 *
 * Google returns something for every query, so a non-empty response is not
 * evidence of anything. Requiring the disambiguator to actually appear in the
 * text is what separates "we found this person" from "we found a person".
 */
function confirms(results: SerpResult[], token: string): boolean {
  const needle = token.toLowerCase();
  return results.some((result) =>
    `${result.title ?? ""} ${result.snippet ?? ""}`.toLowerCase().includes(needle)
  );
}

function condense(results: SerpResult[]): string {
  return results
    .slice(0, 4)
    .map((result) => [result.title, result.snippet].filter(Boolean).join(" — "))
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .slice(0, 2000);
}

export async function enrichEntities(
  eventSlug: string,
  options: { limit?: number } = {}
): Promise<EnrichResult> {
  const env = loadEnv();
  if (!env.SERPAPI_API_KEY) {
    console.log("  SERPAPI_API_KEY not set — skipping enrichment");
    return { enriched: 0, unconfirmed: 0, ambiguous: 0, searchesUsed: 0 };
  }

  const limit = options.limit ?? DEFAULT_LIMIT;
  const event = await prisma.event.findUniqueOrThrow({ where: { slug: eventSlug } });

  const candidates = await prisma.entity.findMany({
    where: {
      eventId: event.id,
      retiredAt: null,
      enrichedAt: null,
      kind: { in: ["PERSON", "ORG", "BOOTH"] },
    },
    include: { incoming: { select: { from: { select: { title: true } } } } },
  });

  // Thinnest first. A speaker with a role and a bio gains little from four
  // search snippets; a bare name gains the difference between matchable and
  // invisible, and the budget should be spent there.
  const ordered = candidates.sort((a, b) => {
    const weight = (e: (typeof candidates)[number]) =>
      (e.description ? 2 : 0) + (e.subtitle ? 1 : 0);
    return weight(a) - weight(b);
  });

  let enriched = 0;
  let unconfirmed = 0;
  let ambiguous = 0;
  let searchesUsed = 0;

  const queued = ordered
    .map((entity) => ({
      entity,
      plan: buildQuery(entity, entity.incoming.map((link) => link.from.title)),
    }))
    .filter((row) => {
      if (!row.plan) ambiguous++;
      return row.plan !== null;
    })
    .slice(0, limit);

  await mapWithLimit(queued, CONCURRENCY, async ({ entity, plan }) => {
    try {
      const results = await cachedSearch(plan!.query, env.SERPAPI_API_KEY!);
      searchesUsed++;

      if (!confirms(results, plan!.confirm)) {
        unconfirmed++;
        return;
      }

      const text = condense(results);
      if (text.length === 0) {
        unconfirmed++;
        return;
      }

      await prisma.entity.update({
        where: { id: entity.id },
        // enrichedAt is stamped so a later run skips this row, and so a stale
        // enrichment is visible rather than indistinguishable from a fresh one.
        data: { enrichedText: text, enrichedAt: new Date() },
      });
      enriched++;
    } catch (error) {
      console.warn(
        `  enrich failed for "${entity.title}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  return { enriched, unconfirmed, ambiguous, searchesUsed };
}
