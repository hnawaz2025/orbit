import { z } from "zod";

// The shape of an extraction, and the coercions that keep a page of correctly
// read sessions from being thrown away over a synonym.
//
// Deliberately free of I/O. extract.ts imports the model client, which
// validates configuration at module scope and exits if a key is missing -- so
// keeping the parsing rules here is what lets them be tested without secrets,
// which is exactly the code most worth testing.

/**
 * Vocabulary a model reasonably reaches for that is not in our enum.
 *
 * API World's programme really does contain "Master Workshop:" sessions, so a
 * model answering WORKSHOP is reading the page correctly -- our enum is simply
 * coarser than the page. Failing the chunk over the label would discard a dozen
 * correctly-parsed sessions to punish one word.
 *
 * The distinction that matters: this maps *vocabulary*, never facts. A talk
 * called a workshop is still that talk. Nothing here invents or reclassifies an
 * entity, it only agrees on a name for the kind of thing it already is.
 */
const KIND_SYNONYMS: Record<string, string> = {
  WORKSHOP: "TALK",
  SESSION: "TALK",
  KEYNOTE: "TALK",
  PANEL: "TALK",
  TUTORIAL: "TALK",
  PRESENTATION: "TALK",
  ROUNDTABLE: "TALK",
  DEMO: "TALK",
  SPEAKER: "PERSON",
  ATTENDEE: "PERSON",
  COMPANY: "ORG",
  SPONSOR: "ORG",
  EXHIBITOR: "ORG",
  VENDOR: "ORG",
  STAND: "BOOTH",
  TABLE: "BOOTH",
};

const ENTITY_KINDS = [
  "TALK",
  "PERSON",
  "BOOTH",
  "ORG",
  "ROLE",
  "PROJECT",
  "TEAM",
] as const;

export const kindSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const upper = value.trim().toUpperCase();
  return KIND_SYNONYMS[upper] ?? upper;
}, z.enum(ENTITY_KINDS));

/**
 * Confidence arrives as a number, a numeric string, or occasionally a
 * percentage. Coerced and clamped rather than rejected: this field decides
 * whether a row is kept, so a malformed one should make the row *more*
 * suspicious, not destroy the batch it arrived in. Anything unreadable becomes
 * 0, which the floor then drops on its own.
 */
export const confidenceSchema = z.preprocess((value) => {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof parsed !== "number" || Number.isNaN(parsed)) return 0;
  // A model that answers "85" means 85%, not a confidence of 85. The threshold
  // is 10 rather than 1 because a value just over 1 -- 1.2, say -- is a model
  // overshooting the top of the scale, not a claim of 1.2% confidence, and
  // dividing it would turn near-certainty into a row the floor discards.
  const scaled = parsed >= 10 && parsed <= 100 ? parsed / 100 : parsed;
  return Math.min(Math.max(scaled, 0), 1);
}, z.number().min(0).max(1));

/**
 * Tags come back as an array, a comma-separated string, or null. All three mean
 * the same thing, and none of them is worth losing a page over.
 */
export const tagsSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return value;
}, z.array(z.string()));

export const namesSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    return value
      .split(/[,;]| and /)
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return value;
}, z.array(z.string()).optional());

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

export const extractedEntitySchema = z.object({
  kind: kindSchema,
  title: z.string().min(1),
  subtitle: nullableString,
  description: nullableString,
  locationName: nullableString,
  startsAt: nullableString,
  endsAt: nullableString,
  level: nullableString,
  isDurable: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
  tags: tagsSchema,
  confidence: confidenceSchema,
  speakerNames: namesSchema,
  orgName: nullableString,
});

/**
 * Models drop the wrapper and return a bare array often enough to be worth
 * accepting. The instruction still asks for {"entities": [...]} -- this only
 * stops a formatting preference from costing a page of correctly-read sessions.
 */
export const extractionSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { entities: value } : value),
  z.object({ entities: z.array(extractedEntitySchema) })
);
