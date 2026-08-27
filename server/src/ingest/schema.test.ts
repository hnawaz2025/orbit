import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  confidenceSchema,
  extractedEntitySchema,
  kindSchema,
  namesSchema,
  tagsSchema,
} from "./schema";

// These rules exist because a strict schema was silently destroying whole pages
// of correctly-read sessions. Each case below is a real model output that cost
// a chunk before it was handled.

describe("kind coercion", () => {
  test("passes the canonical kinds through untouched", () => {
    assert.equal(kindSchema.parse("TALK"), "TALK");
    assert.equal(kindSchema.parse("PERSON"), "PERSON");
  });

  test("maps the vocabulary a model reasonably reaches for", () => {
    // API World's programme really does contain "Master Workshop:" sessions,
    // so WORKSHOP is the model reading the page correctly.
    assert.equal(kindSchema.parse("WORKSHOP"), "TALK");
    assert.equal(kindSchema.parse("KEYNOTE"), "TALK");
    assert.equal(kindSchema.parse("PANEL"), "TALK");
    assert.equal(kindSchema.parse("SPONSOR"), "ORG");
    assert.equal(kindSchema.parse("COMPANY"), "ORG");
    assert.equal(kindSchema.parse("SPEAKER"), "PERSON");
  });

  test("is case and whitespace insensitive", () => {
    assert.equal(kindSchema.parse("  workshop "), "TALK");
    assert.equal(kindSchema.parse("Talk"), "TALK");
  });

  test("still rejects a kind that means something we do not model", () => {
    // Coercion maps vocabulary, never facts. An unrecognised kind is a real
    // disagreement and must not be silently forced into TALK.
    assert.throws(() => kindSchema.parse("SPACESHIP"));
  });
});

describe("confidence coercion", () => {
  test("accepts a plain number", () => {
    assert.equal(confidenceSchema.parse(0.7), 0.7);
  });

  test("accepts a numeric string", () => {
    assert.equal(confidenceSchema.parse("0.9"), 0.9);
  });

  test("reads a percentage as a percentage", () => {
    assert.equal(confidenceSchema.parse(85), 0.85);
    assert.equal(confidenceSchema.parse(100), 1);
  });

  test("treats a slight overshoot as near-certainty, not a percentage", () => {
    // 1.2 is a model running past the top of the scale. Dividing it by 100
    // would turn near-certainty into a row the confidence floor discards.
    assert.equal(confidenceSchema.parse(1.2), 1);
    assert.equal(confidenceSchema.parse(1.4), 1);
  });

  test("clamps rather than throwing", () => {
    assert.equal(confidenceSchema.parse(-3), 0);
  });

  test("unreadable confidence becomes 0 so the floor drops the row", () => {
    // A malformed confidence should make its row more suspicious, never
    // destroy the batch it arrived in.
    assert.equal(confidenceSchema.parse("very sure"), 0);
    assert.equal(confidenceSchema.parse(null), 0);
  });
});

describe("tags coercion", () => {
  test("accepts an array", () => {
    assert.deepEqual(tagsSchema.parse(["api", "ai"]), ["api", "ai"]);
  });

  test("splits a delimited string", () => {
    assert.deepEqual(tagsSchema.parse("api, ai; cloud"), ["api", "ai", "cloud"]);
  });

  test("treats null and undefined as no tags", () => {
    assert.deepEqual(tagsSchema.parse(null), []);
    assert.deepEqual(tagsSchema.parse(undefined), []);
  });
});

describe("speaker name coercion", () => {
  test("accepts an array", () => {
    assert.deepEqual(namesSchema.parse(["Ada Lovelace"]), ["Ada Lovelace"]);
  });

  test("splits the prose forms a model writes", () => {
    assert.deepEqual(namesSchema.parse("Ada Lovelace, Grace Hopper"), [
      "Ada Lovelace",
      "Grace Hopper",
    ]);
    assert.deepEqual(namesSchema.parse("Ada Lovelace and Grace Hopper"), [
      "Ada Lovelace",
      "Grace Hopper",
    ]);
  });

  test("null means no speakers, not an empty name", () => {
    assert.equal(namesSchema.parse(null), undefined);
  });
});

describe("field-name translation", () => {
  // The bug this prevents: Zod strips unknown keys without complaint, so a
  // model answering {"location": ..., "speaker": ...} -- a completely correct
  // reading of the page -- arrived as a bare title with every field empty, and
  // nothing reported a problem. Three model generations looked broken before
  // the raw output showed the extraction had been right all along.
  const base = { kind: "TALK", title: "A session", confidence: 1 };

  test("accepts the field names models actually use", () => {
    const parsed = extractedEntitySchema.parse({
      ...base,
      location: "AI TechWorld -- Main Stage",
      speaker: "Ayan Gupta",
      abstract: "About batch modernization.",
      company: "GitHub",
    });

    assert.equal(parsed.locationName, "AI TechWorld -- Main Stage");
    assert.deepEqual(parsed.speakerNames, ["Ayan Gupta"]);
    assert.equal(parsed.description, "About batch modernization.");
    assert.equal(parsed.orgName, "GitHub");
  });

  test("is insensitive to case and separators", () => {
    const parsed = extractedEntitySchema.parse({
      ...base,
      Location: "Main Stage",
      speaker_names: "Grace Hopper",
      job_title: "Principal Engineer",
    });

    assert.equal(parsed.locationName, "Main Stage");
    assert.deepEqual(parsed.speakerNames, ["Grace Hopper"]);
    assert.equal(parsed.subtitle, "Principal Engineer");
  });

  test("our own field names still win over a translated one", () => {
    // Translation fills gaps; it must never overwrite something the model
    // addressed to us directly.
    const parsed = extractedEntitySchema.parse({
      ...base,
      locationName: "Correct Room",
      location: "Wrong Room",
    });
    assert.equal(parsed.locationName, "Correct Room");
  });

  test("merges every tag-ish field rather than picking one", () => {
    const parsed = extractedEntitySchema.parse({
      ...base,
      track: "API Security",
      topics: ["MCP", "Agents"],
      tags: ["existing"],
    });

    assert.deepEqual(
      [...parsed.tags].sort(),
      ["API Security", "Agents", "MCP", "existing"]
    );
  });

  test("still parses an entity that already speaks our vocabulary", () => {
    const parsed = extractedEntitySchema.parse({
      ...base,
      locationName: "Room 2",
      speakerNames: ["Ada Lovelace"],
      tags: ["apis"],
    });
    assert.equal(parsed.locationName, "Room 2");
    assert.deepEqual(parsed.speakerNames, ["Ada Lovelace"]);
    assert.deepEqual(parsed.tags, ["apis"]);
  });
});
