import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findConflicts, sortPlan, type PlanItem } from "@orbit/shared";

// Plan arithmetic lives in the shared package because it is a claim about the
// world rather than a rendering choice -- whether two sessions actually collide,
// and whether a person can physically get from one to the next.

const at = (h: number, m = 0) =>
  new Date(Date.UTC(2026, 8, 2, h, m)).toISOString();

const item = (over: Partial<PlanItem> = {}): PlanItem => ({
  id: "a",
  title: "A session",
  kind: "TALK",
  locationName: "Main Stage",
  startsAt: at(10),
  endsAt: at(11),
  ...over,
});

describe("findConflicts", () => {
  test("flags two sessions that overlap", () => {
    const a = item({ id: "a", startsAt: at(10), endsAt: at(11) });
    const b = item({ id: "b", startsAt: at(10, 30), endsAt: at(11, 30) });
    assert.deepEqual(findConflicts(a, [b]), [{ kind: "overlap", withId: "b" }]);
  });

  test("does not flag sessions that merely touch", () => {
    // Ending exactly when the next begins is back-to-back, not a collision.
    const a = item({ id: "a", startsAt: at(11), endsAt: at(12), locationName: "Main Stage" });
    const b = item({ id: "b", startsAt: at(10), endsAt: at(11), locationName: "Main Stage" });
    assert.deepEqual(findConflicts(a, [b]), []);
  });

  test("flags a room change with no time to make it", () => {
    const a = item({ id: "a", startsAt: at(11, 5), endsAt: at(12), locationName: "Expo Stage" });
    const b = item({ id: "b", startsAt: at(10), endsAt: at(11), locationName: "Main Stage" });
    assert.deepEqual(findConflicts(a, [b]), [{ kind: "tight", withId: "b", minutes: 5 }]);
  });

  test("does not flag a tight gap in the same room", () => {
    // Warning about back-to-back sessions on one stage would train people to
    // ignore the warning.
    const a = item({ id: "a", startsAt: at(11, 5), endsAt: at(12), locationName: "Main Stage" });
    const b = item({ id: "b", startsAt: at(10), endsAt: at(11), locationName: "Main Stage" });
    assert.deepEqual(findConflicts(a, [b]), []);
  });

  test("leaves a comfortable room change alone", () => {
    const a = item({ id: "a", startsAt: at(11, 30), endsAt: at(12), locationName: "Expo Stage" });
    const b = item({ id: "b", startsAt: at(10), endsAt: at(11), locationName: "Main Stage" });
    assert.deepEqual(findConflicts(a, [b]), []);
  });

  test("never puts an untimed entity in conflict", () => {
    // A booth is staffed all day and a person is not scheduled at all.
    const person = item({ id: "p", kind: "PERSON", startsAt: null, endsAt: null });
    const session = item({ id: "s" });
    assert.deepEqual(findConflicts(person, [session]), []);
    assert.deepEqual(findConflicts(session, [person]), []);
  });

  test("ignores itself", () => {
    const a = item({ id: "a" });
    assert.deepEqual(findConflicts(a, [a]), []);
  });
});

describe("sortPlan", () => {
  test("orders by start time and puts untimed items last", () => {
    const out = sortPlan([
      item({ id: "late", startsAt: at(15), endsAt: at(16) }),
      item({ id: "person", startsAt: null, endsAt: null }),
      item({ id: "early", startsAt: at(9), endsAt: at(10) }),
    ]);
    assert.deepEqual(out.map((i) => i.id), ["early", "late", "person"]);
  });
});
