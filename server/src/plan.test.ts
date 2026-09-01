import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findConflicts, sortPlan, toPlanItem, type PlanItem } from "@orbit/shared";

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

describe("toPlanItem", () => {
  const base = {
    id: "p1", kind: "PERSON" as const, title: "Jeremy Snyder",
    subtitle: "CEO @ FireTail", description: null, locationName: null,
    startsAt: null, endsAt: null, rank: 1, reason: "…", profileUrl: null,
  };

  test("places a speaker at the session they are speaking at", () => {
    // They were filed as untimed and pushed below the entire day, which
    // rendered the differentiator as an appendix. A speaker is findable at
    // their session, and that is a real position on the axis.
    const item = toPlanItem({
      ...base,
      linked: [{
        id: "t1", kind: "TALK", title: "API security", subtitle: null,
        locationName: "Main Stage", relation: "SPEAKS_AT",
        startsAt: "2026-09-02T17:00:00.000Z", endsAt: "2026-09-02T17:25:00.000Z",
      }],
    });

    assert.equal(item.startsAt, "2026-09-02T17:00:00.000Z");
    assert.equal(item.endsAt, "2026-09-02T17:25:00.000Z");
    assert.equal(item.locationName, "Main Stage");
  });

  test("leaves a genuinely unscheduled person untimed", () => {
    // A booth staffer or an attendee with no session has no position, and
    // inventing one would be worse than the shelf.
    const item = toPlanItem({ ...base, linked: [] });
    assert.equal(item.startsAt, null);
    assert.equal(item.locationName, null);
  });

  test("never overrides a session's own time with a link's", () => {
    const item = toPlanItem({
      ...base,
      kind: "TALK",
      startsAt: "2026-09-02T10:00:00.000Z",
      endsAt: "2026-09-02T10:25:00.000Z",
      locationName: "Workshop Stage A",
      linked: [{
        id: "s1", kind: "PERSON", title: "Someone", subtitle: null,
        locationName: "Elsewhere", relation: "SPEAKS_AT",
        startsAt: "2026-09-03T09:00:00.000Z", endsAt: "2026-09-03T09:25:00.000Z",
      }],
    });
    assert.equal(item.startsAt, "2026-09-02T10:00:00.000Z");
    assert.equal(item.locationName, "Workshop Stage A");
  });
});

describe("a person is not a rival to the session they speak at", () => {
  // A person inherits the time and room of their session, so before this the
  // plan told you to choose between two people standing on the same stage.
  const stage = { locationName: "Main Stage", startsAt: at(10), endsAt: at(11) };

  test("two speakers on one panel do not clash", () => {
    const one = item({ id: "one", kind: "PERSON", title: "Speaker One", ...stage });
    const two = item({ id: "two", kind: "PERSON", title: "Speaker Two", ...stage });
    assert.deepEqual(findConflicts(one, [two]), []);
  });

  test("a speaker does not clash with their own talk", () => {
    const person = item({ id: "p", kind: "PERSON", title: "Speaker", ...stage });
    const talk = item({ id: "t", kind: "TALK", title: "The talk", ...stage });
    assert.deepEqual(findConflicts(person, [talk]), []);
  });

  test("a speaker still clashes with a session in another room", () => {
    const person = item({ id: "p", kind: "PERSON", title: "Speaker", ...stage });
    const elsewhere = item({ id: "e", locationName: "Expo Stage", startsAt: at(10, 30), endsAt: at(11, 30) });
    assert.deepEqual(findConflicts(person, [elsewhere]), [{ kind: "overlap", withId: "e" }]);
  });

  test("a speaker with no known room still clashes", () => {
    // Unknown location is not evidence of the same location.
    const person = item({ id: "p", kind: "PERSON", title: "Speaker", ...stage, locationName: null });
    const talk = item({ id: "t", kind: "TALK", ...stage });
    assert.deepEqual(findConflicts(person, [talk]), [{ kind: "overlap", withId: "t" }]);
  });

  test("two sessions double-booked into one room are still flagged", () => {
    // A contradiction in the programme, and the attendee is better served
    // seeing it than having it filtered away.
    const a = item({ id: "a", ...stage });
    const b = item({ id: "b", ...stage });
    assert.deepEqual(findConflicts(a, [b]), [{ kind: "overlap", withId: "b" }]);
  });
});
