import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decisionsToMake, selectNowNext, type PlanItem } from "@orbit/shared";

// Saving is a shortlist, not a commitment. Overlaps are the raw material of
// the plan rather than its failure state, and the surface's job is to convert
// a shortlist into a next action, repeatedly.

const at = (min: number) => new Date(2026, 8, 2, 9, min).toISOString();
const NOW = new Date(2026, 8, 2, 9, 60);

const item = (id: string, from: number, to: number, over: Partial<PlanItem> = {}): PlanItem => ({
  id, title: id, kind: "TALK", locationName: "Main Stage",
  startsAt: at(from), endsAt: at(to), ...over,
});

describe("selectNowNext", () => {
  test("prefers what is under way over what is coming", () => {
    const running = item("running", 45, 75);
    const next = item("next", 90, 120);
    assert.equal(selectNowNext([next, running], NOW)?.id, "running");
  });

  test("falls to the next thing when nothing is under way", () => {
    assert.equal(selectNowNext([item("a", 90, 120), item("b", 150, 180)], NOW)?.id, "a");
  });

  test("skips what was declined, so the card refills", () => {
    const out = selectNowNext(
      [item("a", 90, 120), item("b", 150, 180)],
      NOW,
      new Set(["a"])
    );
    assert.equal(out?.id, "b");
  });

  test("ignores items with no time", () => {
    // A person is not a next action in the scheduled sense.
    const person: PlanItem = {
      id: "p", title: "Ada", kind: "PERSON", locationName: null, startsAt: null, endsAt: null,
    };
    assert.equal(selectNowNext([person, item("a", 90, 120)], NOW)?.id, "a");
  });

  test("returns nothing when the day is done", () => {
    assert.equal(selectNowNext([item("done", 0, 30)], NOW), null);
  });
});

describe("decisionsToMake", () => {
  test("surfaces a clash as one choice", () => {
    const out = decisionsToMake([item("a", 90, 120), item("b", 100, 130)], new Set(), NOW);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].options.map((o) => o.id).sort(), ["a", "b"]);
  });

  test("drops a choice once either side is decided", () => {
    const out = decisionsToMake(
      [item("a", 90, 120), item("b", 100, 130)],
      new Set(["a"]),
      NOW
    );
    assert.equal(out.length, 0);
  });

  test("does not ask about a clash that has already passed", () => {
    // The queue exists to be worked through, and one that keeps asking about
    // this morning is noise.
    const out = decisionsToMake([item("a", 0, 30), item("b", 10, 40)], new Set(), NOW);
    assert.equal(out.length, 0);
  });

  test("says nothing when the shortlist has no clashes", () => {
    assert.equal(decisionsToMake([item("a", 90, 120), item("b", 150, 180)], new Set(), NOW).length, 0);
  });
});
