import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { admits } from "@orbit/shared";

// Recommending a session someone's pass does not admit is the same failure as
// inventing a room: they walk there and cannot get in. At API World an OPEN
// pass admits 117 of 196 sessions, so this decides 40% of the programme.

describe("admits", () => {
  const OPEN_ONLY = ["OPEN Pass", "API World"];
  const PRO_AND_PREMIUM = ["PRO Pass", "PREMIUM Pass", "API World"];
  const ALL_THREE = ["OPEN Pass", "PRO Pass", "PREMIUM Pass"];

  test("a tier is admitted where the session lists it", () => {
    assert.equal(admits("OPEN", ALL_THREE), true);
    assert.equal(admits("PRO", PRO_AND_PREMIUM), true);
    assert.equal(admits("PREMIUM", PRO_AND_PREMIUM), true);
  });

  test("a tier is refused where the session does not list it", () => {
    // The case that matters: 79 API World sessions are closed to OPEN.
    assert.equal(admits("OPEN", PRO_AND_PREMIUM), false);
  });

  test("a higher tier is not admitted to a lower-only session by accident", () => {
    // Tags are authoritative, not inferred from a hierarchy. If the conference
    // says OPEN only, that is what it means.
    assert.equal(admits("PREMIUM", OPEN_ONLY), false);
  });

  test("an entity with no pass tag is admitted", () => {
    // Absence means the source did not say. Refusing on a missing tag would
    // turn an incomplete listing into a smaller conference.
    assert.equal(admits("OPEN", ["API World", "Agentic AI"]), true);
    assert.equal(admits("PREMIUM", []), true);
  });

  test("people and booths are never gated", () => {
    // A speaker is not behind a ticket tier.
    assert.equal(admits("OPEN", []), true);
  });

  test("invite-only admits nobody by tier", () => {
    assert.equal(admits("PREMIUM", ["Invite Only"]), false);
    assert.equal(admits("OPEN", ["Invite Only"]), false);
  });

  test("is insensitive to how the tag is cased", () => {
    assert.equal(admits("PRO", ["pro pass"]), true);
    assert.equal(admits("PRO", ["PRO PASS"]), true);
  });
});
