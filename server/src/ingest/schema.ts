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

/**
 * Field names a model reaches for instead of ours.
 *
 * This is the highest-leverage rule in the file. Zod strips unknown keys
 * without complaint, so a model that answers {"location": "Main Stage",
 * "speaker": "Ayan Gupta"} -- a completely correct reading of the page --
 * arrives as a bare title with every field empty, and nothing anywhere reports
 * a problem. The extraction looked broken for two model generations before the
 * raw output showed it had been right all along.
 *
 * Our names are not more correct than the model's, they are just ours. Agreeing
 * to translate is cheaper than expecting every model to guess our vocabulary.
 */
const FIELD_ALIASES: Record<string, string> = {
  location: "locationName",
  room: "locationName",
  venue: "locationName",
  stage: "locationName",
  place: "locationName",

  speaker: "speakerNames",
  speakers: "speakerNames",
  speakername: "speakerNames",
  presenter: "speakerNames",
  presenters: "speakerNames",
  author: "speakerNames",

  company: "orgName",
  organization: "orgName",
  organisation: "orgName",
  org: "orgName",
  employer: "orgName",

  abstract: "description",
  summary: "description",
  bio: "description",
  biography: "description",
  details: "description",

  start: "startsAt",
  starttime: "startsAt",
  starts: "startsAt",
  end: "endsAt",
  endtime: "endsAt",
  ends: "endsAt",

  audience: "level",
  audiencelevel: "level",
  difficulty: "level",

  role: "subtitle",
  jobtitle: "subtitle",
  headline: "subtitle",

  name: "title",
  type: "kind",
};

/**
 * Our own field names, keyed by their separator-stripped lowercase form, so
 * that speaker_names and locationName both land on the same field. Without
 * this, a model writing our vocabulary in snake_case was treated as writing
 * unknown keys -- the exact bug the alias table exists to prevent, reintroduced
 * one spelling later.
 */
const CANONICAL_FIELDS = [
  "kind",
  "title",
  "subtitle",
  "description",
  "locationName",
  "startsAt",
  "endsAt",
  "level",
  "isDurable",
  "tags",
  "confidence",
  "speakerNames",
  "orgName",
];

const CANONICAL_BY_NORMALISED = new Map(
  CANONICAL_FIELDS.map((field) => [field.toLowerCase(), field])
);

/** Keys whose values are all keyword-ish and belong together in `tags`. */
const TAG_ALIASES = new Set(["track", "tracks", "topic", "topics", "category", "categories", "tags"]);

/**
 * Rewrite a raw entity object onto our field names.
 *
 * A canonical key already present always wins -- translation fills gaps, it
 * never overwrites something the model addressed to us directly. Tag-ish fields
 * merge rather than replace, since a session can carry both a track and topics
 * and both are worth embedding.
 */
function normaliseKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const tags: string[] = [];

  const collectTags = (raw: unknown) => {
    if (typeof raw === "string") {
      tags.push(...raw.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean));
    } else if (Array.isArray(raw)) {
      tags.push(...raw.filter((tag): tag is string => typeof tag === "string"));
    }
  };

  for (const [key, raw] of Object.entries(source)) {
    const lower = key.toLowerCase().replace(/[\s_-]/g, "");

    if (TAG_ALIASES.has(lower)) {
      collectTags(raw);
      continue;
    }

    const canonical = CANONICAL_BY_NORMALISED.get(lower) ?? FIELD_ALIASES[lower] ?? key;
    if (canonical in output && output[canonical] !== undefined && output[canonical] !== null) continue;
    output[canonical] = raw;
  }

  if (tags.length > 0) {
    const existing = Array.isArray(output.tags) ? (output.tags as unknown[]) : [];
    output.tags = [...new Set([...existing.filter((t): t is string => typeof t === "string"), ...tags])];
  }

  return output;
}

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

export const extractedEntitySchema = z.preprocess(normaliseKeys, z.object({
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
}));

/**
 * Models drop the wrapper and return a bare array often enough to be worth
 * accepting. The instruction still asks for {"entities": [...]} -- this only
 * stops a formatting preference from costing a page of correctly-read sessions.
 */
export const extractionSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { entities: value } : value),
  z.object({ entities: z.array(extractedEntitySchema) })
);
