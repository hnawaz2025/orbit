import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { localToUtcIso } from "./timezone";

// Getting this wrong is silent and total: every session shifts by the zone
// offset, and the ranking that decides whether an attendee can reach a room
// starts working on fiction.

describe("localToUtcIso", () => {
  test("reads a conference wall clock as the venue's time, not the server's", () => {
    // API World, noon in Santa Clara on the first day. September is PDT (-7).
    assert.equal(localToUtcIso("2026-09-01T12:00:00", "America/Los_Angeles"), "2026-09-01T19:00:00.000Z");
  });

  test("handles a zone on the other side of UTC", () => {
    assert.equal(localToUtcIso("2026-09-01T12:00:00", "Europe/Berlin"), "2026-09-01T10:00:00.000Z");
  });

  test("applies standard time outside daylight saving", () => {
    // January in Los Angeles is PST (-8), not PDT.
    assert.equal(localToUtcIso("2026-01-15T12:00:00", "America/Los_Angeles"), "2026-01-15T20:00:00.000Z");
  });

  test("handles midnight, where hour renders as 24", () => {
    assert.equal(localToUtcIso("2026-09-02T00:00:00", "America/Los_Angeles"), "2026-09-02T07:00:00.000Z");
  });

  test("ignores an offset the source unexpectedly included", () => {
    assert.equal(localToUtcIso("2026-09-01T12:00:00Z", "America/Los_Angeles"), "2026-09-01T19:00:00.000Z");
  });

  test("returns null for something unparseable rather than an invalid date", () => {
    assert.equal(localToUtcIso("not a time", "America/Los_Angeles"), null);
  });
});
