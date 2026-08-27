import { z } from "zod";
import { callForJson } from "../ai/jsonRetry";
import { complete } from "../ai/llm";
import { extractionSchema } from "./schema";
import { INGEST_CONFIDENCE_FLOOR, type ExtractedEntity } from "./types";

// Tier 2 extraction: arbitrary rendered page text in, structured entities out.
//
// This is the file that makes onboarding a new event cost a URL instead of a
// sprint, and it is also the file most able to poison the product. Everything
// below is arranged around one asymmetry: a missing session is a gap the
// attendee never notices, while an invented session sends a real person to a
// room that does not exist and destroys their trust in every other card on the
// screen. So every ambiguity resolves toward dropping the row.

/**
 * Models emit `null` for "this field was not on the page" at least as often as
 * they omit the key, and the two are the same statement. Zod's `.optional()`
 * accepts a missing key but rejects an explicit null, so a single null field
 * -- one session without a printed audience level -- would fail the whole
 * chunk, retry, fail identically, and drop every entity on it.
 *
 * That failure is expensive and quiet: it looks like a slow or unreliable
 * model rather than a schema that disagrees with how models actually write
 * JSON. Normalising both spellings to `undefined` here is the fix.
 */
export const __SYSTEM_PROMPT_MARKER = true;

const SYSTEM_PROMPT = `You extract structured conference data from the text of a web page.

You are transcribing, not writing. Every field you emit must be literally present in the text you were given.

"kind" must be exactly one of: TALK, PERSON, BOOTH, ORG, ROLE, PROJECT, TEAM.
  A workshop, keynote, panel, tutorial or roundtable is a TALK.
  A named human being is a PERSON. A company is an ORG. An expo stand is a BOOTH.
  Do not invent other kinds.

Rules:
- If a field is not stated on the page, omit it. Never infer a room, a time, a company, or a job title that is not written down.
- Never invent an entity to fill out a list. A page with three sessions yields three entities.
- Do not summarise or rewrite descriptions. Copy the abstract or bio as written, trimmed of surrounding boilerplate.
- Navigation links, cookie banners, ticket prices, and marketing copy are not entities. Skip them.
- "confidence" is your own honest estimate that this entity is real and correctly parsed:
    1.0  every field came from an unambiguous, clearly-labelled block of text
    0.7  the entity is clearly real but some fields were ambiguous
    0.4  you are piecing it together from fragments
  Be harsh. A dropped entity costs nothing; a wrong one is expensive.
- Times must be ISO 8601 with a timezone offset, and must fall inside the event window you are given. If you cannot determine the date with certainty, omit both times rather than guessing.
- "level" is only for an audience label the page itself prints ("Beginner", "Advanced", "200-level"). Never assign one yourself.
- "isDurable" is true only if the page says the session is recorded or streamed.

Return ONLY a JSON object of the form {"entities": [...]}. No prose, no markdown fences.`;

export { SYSTEM_PROMPT as __SYSTEM_PROMPT };

export interface ExtractInput {
  text: string;
  sourceUrl: string;
  hint?: string;
  /** Used to reject any timestamp that lands outside the conference. */
  eventWindow: { startsAt: Date; endsAt: Date };
  /** Override the configured extraction model. Used by the model bake-off. */
  model?: string;
}

/**
 * Dates are the most hallucination-prone field in the extraction.
 *
 * A model reading "2:00 PM" with no date attached will happily supply one, and
 * an out-of-window timestamp is a mechanical signal that the value was reasoned
 * about rather than read off the page.
 *
 * This began as a hard validator that failed the whole chunk. That was wrong at
 * a cost of about twenty sessions per occurrence: a single roundtable dated
 * three days after the conference ended discarded every correctly-parsed entity
 * beside it, twice, and then dropped the chunk. The offence is one field on one
 * entity, and the blast radius should match.
 *
 * So it is soft now. The first failure retries with a correction note naming
 * the offending value, which sometimes gets a clean answer. If the second
 * attempt still carries a bad date, the extraction is accepted and the bad
 * timestamps are stripped by sanitiseTimes below -- an entity with a title,
 * speaker and room but no time is a useful recommendation; a missing entity is
 * not.
 */
function buildDateCheck(input: ExtractInput) {
  const { startsAt, endsAt } = input.eventWindow;
  // A day of slack each side covers timezone edges and pre-event workshops
  // without admitting a date from another year.
  const floor = startsAt.getTime() - 24 * 60 * 60 * 1000;
  const ceiling = endsAt.getTime() + 24 * 60 * 60 * 1000;

  const isOutOfWindow = (raw: string): boolean => {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return true;
    return parsed.getTime() < floor || parsed.getTime() > ceiling;
  };

  const check = (parsed: { entities: { title: string; startsAt?: string; endsAt?: string }[] }) => {
    for (const entity of parsed.entities) {
      for (const field of ["startsAt", "endsAt"] as const) {
        const raw = entity[field];
        if (raw && isOutOfWindow(raw)) {
          throw new Error(
            `Entity "${entity.title}" has ${field}=${raw}, which is outside the event window ` +
              `(${startsAt.toISOString()} to ${endsAt.toISOString()}). If the page did not state a date, omit the time instead of inferring one.`
          );
        }
      }
    }
  };

  return { check, isOutOfWindow };
}

/**
 * Extract entities from one chunk of page text.
 *
 * Returns only rows at or above INGEST_CONFIDENCE_FLOOR; the rest are dropped
 * with a log line, since a corpus that silently thins out is much harder to
 * debug than one that says what it discarded.
 */
export async function extractEntities(input: ExtractInput): Promise<ExtractedEntity[]> {
  const { text, sourceUrl, hint, eventWindow } = input;

  const userPrompt = [
    hint ? `This page is: ${hint}` : null,
    `Source URL: ${sourceUrl}`,
    `Event window: ${eventWindow.startsAt.toISOString()} to ${eventWindow.endsAt.toISOString()}`,
    "",
    "PAGE TEXT:",
    text,
  ]
    .filter(Boolean)
    .join("\n");

  const { check: checkDates, isOutOfWindow } = buildDateCheck(input);

  /**
   * A substantial chunk that yields nothing is usually a model lapse, not an
   * empty page.
   *
   * Observed directly: a 6000-character chunk carrying 27 sessions -- each with
   * a title, a speaker and a labelled "Location:" -- came back with zero
   * entities and logged "0 entities" as though that were an answer. Silent loss
   * of a full chunk is the worst failure mode in this pipeline, because a thin
   * corpus looks exactly like a thorough one from the outside.
   *
   * Soft, so a genuinely empty chunk -- a footer, a nav-only tail -- costs one
   * extra call and is then accepted. Cheap insurance against losing a
   * twenty-seventh of the programme without noticing.
   */
  const checkNotSilentlyEmpty = (parsed: { entities: unknown[] }) => {
    const SUBSTANTIAL_CHARS = 2000;
    if (parsed.entities.length === 0 && text.length > SUBSTANTIAL_CHARS) {
      throw new Error(
        `Returned no entities for ${text.length} characters of page text. If this section genuinely lists no sessions, people, or companies, return an empty list again; otherwise extract what is there.`
      );
    }
  };

  const result = await callForJson(
    extractionSchema,
    (correctionNote) =>
      complete({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        correctionNote,
        temperature: 0,
        model: input.model,
      }),
    undefined,
    // Both soft: each retries once with the specific problem named, then
    // accepts rather than discarding a chunk. See buildDateCheck.
    (parsed) => {
      checkNotSilentlyEmpty(parsed);
      checkDates(parsed);
    }
  );

  const kept: ExtractedEntity[] = [];
  let dropped = 0;
  let timesStripped = 0;

  for (const entity of result.entities) {
    if (entity.confidence < INGEST_CONFIDENCE_FLOOR) {
      dropped++;
      continue;
    }

    // Strip any timestamp that survived the retry still out of window. Only the
    // time is discarded, never the entity: a session with a room and a speaker
    // but no time still tells an attendee where to find it, and the schema
    // treats a null time as "not time-bound" rather than as an error.
    let { startsAt, endsAt } = entity;
    if (startsAt && isOutOfWindow(startsAt)) {
      startsAt = undefined;
      timesStripped++;
    }
    if (endsAt && isOutOfWindow(endsAt)) {
      endsAt = undefined;
      timesStripped++;
    }
    // sourceUrl is stamped here rather than asked for: the model has no reason
    // to know it, and letting it echo one back is an invitation to attribute a
    // fact to a page it never read.
    kept.push({ ...entity, startsAt, endsAt, sourceUrl });
  }

  if (dropped > 0) {
    console.log(`  dropped ${dropped} low-confidence entities (floor ${INGEST_CONFIDENCE_FLOOR})`);
  }

  if (timesStripped > 0) {
    console.log(`  stripped ${timesStripped} out-of-window timestamps (entities kept)`);
  }

  return kept;
}
