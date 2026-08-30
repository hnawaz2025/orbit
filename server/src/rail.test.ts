import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { railState } from "@orbit/shared";

// The bug this locks down: an earlier card substituted a relative label for
// the clock inside an hour, so during the conference -- when nearly every
// session worth showing is within an hour -- the time an attendee plans around
// never rendered at all.

const NOW = new Date("2026-09-02T18:00:00Z");
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 2, h, m)).toISOString();

/**
 * The rail renders in the device's zone, which is the right default: an
 * attendee at the venue has a phone set to the venue. Asserting a literal
 * "18:12" would only pass on a machine running UTC, so the expected value is
 * computed the same way the component does.
 */
const localClock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

describe("railState", () => {
  test("always carries the clock, whatever the urgency", () => {
    const later = railState(at(21), at(21, 50), "TALK", NOW);
    const soon = railState(at(18, 12), at(19), "TALK", NOW);
    const now = railState(at(17, 40), at(18, 30), "TALK", NOW);

    // Every timed state has a `start`. This is the whole point.
    for (const state of [later, soon, now]) {
      assert.ok("start" in state && state.start.length > 0, `${state.kind} lost the clock`);
    }
  });

  test("adds a relative lead inside the urgency window, without replacing the time", () => {
    const state = railState(at(18, 12), at(19), "TALK", NOW);
    assert.equal(state.kind, "urgent");
    if (state.kind !== "urgent") return;
    assert.equal(state.lead, "IN 12 MIN");
    assert.equal(state.start, localClock(at(18, 12)), "the absolute start must survive");
  });

  test("reports how much of an in-progress session is left", () => {
    const state = railState(at(17, 40), at(18, 30), "TALK", NOW);
    assert.equal(state.kind, "underway");
    if (state.kind !== "underway") return;
    assert.equal(state.remaining, "30 min left");
  });

  test("names the day for anything not today", () => {
    const tomorrow = new Date(Date.UTC(2026, 8, 3, 17)).toISOString();
    const state = railState(tomorrow, new Date(Date.UTC(2026, 8, 3, 17, 25)).toISOString(), "TALK", NOW);
    assert.equal(state.kind, "scheduled");
    if (state.kind !== "scheduled") return;
    assert.equal(state.day, "THU");
    assert.equal(state.duration, "25 min");
  });

  test("says TODAY rather than a weekday when it is today", () => {
    const state = railState(at(21), at(21, 50), "TALK", NOW);
    assert.equal(state.kind === "scheduled" && state.day, "TODAY");
  });

  test("treats an entity with no time as untimed, never as unknown", () => {
    // A booth is staffed all day and a person is not scheduled at all. The
    // rail states that rather than going blank.
    assert.equal(railState(null, null, "PERSON", NOW).kind, "untimed");
    assert.equal(railState(null, null, "BOOTH", NOW).kind, "untimed");
  });

  test("survives a start with no end", () => {
    const state = railState(at(22), null, "TALK", NOW);
    assert.equal(state.kind, "scheduled");
    if (state.kind !== "scheduled") return;
    assert.equal(state.end, "");
    assert.equal(state.duration, "");
  });
});

describe("railState in the venue's timezone", () => {
  // The bug: the app formatted in the device's zone, so a session at noon in
  // Santa Clara showed as 15:00 to a phone still set to Eastern. Uniformly,
  // confidently wrong -- and invisible to anyone testing from Pacific.
  const VENUE = "America/Los_Angeles";
  // 12:00 in Santa Clara on the first conference day.
  const NOON_AT_VENUE = "2026-09-01T19:00:00.000Z";

  test("renders the conference wall clock, not the device's", () => {
    const state = railState(NOON_AT_VENUE, "2026-09-01T19:50:00.000Z", "TALK", new Date("2026-08-30T12:00:00Z"), VENUE);
    assert.equal(state.kind, "scheduled");
    if (state.kind !== "scheduled") return;
    assert.equal(state.start, "12:00");
    assert.equal(state.end, "–12:50");
  });

  test("is unaffected by where the reader is standing", () => {
    const from = (tz: string) =>
      railState(NOON_AT_VENUE, "2026-09-01T19:50:00.000Z", "TALK", new Date("2026-08-30T12:00:00Z"), tz);
    // Same instant, same venue zone, same answer -- the zone is a property of
    // the conference, not of the phone.
    assert.equal((from(VENUE) as any).start, "12:00");
  });

  test("says TODAY according to the venue's day, not the reader's", () => {
    // 23:30 UTC on Sep 1 is still Sep 1 in Santa Clara (16:30) but already
    // Sep 2 in London. The conference floor decides.
    const lateUtc = new Date("2026-09-01T23:30:00.000Z");
    const state = railState("2026-09-02T02:00:00.000Z", "2026-09-02T02:50:00.000Z", "TALK", lateUtc, VENUE);
    assert.equal(state.kind, "scheduled");
    if (state.kind !== "scheduled") return;
    assert.equal(state.day, "TODAY");
  });
});
