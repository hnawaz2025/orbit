import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isStillToCome } from "./match/upcoming";

const now = new Date("2026-09-02T18:00:00.000Z");

describe("isStillToCome", () => {
  test("a session that has ended is not still to come", () => {
    assert.equal(isStillToCome("2026-09-02T17:59:00.000Z", now), false);
  });

  test("a session ending exactly now has ended", () => {
    assert.equal(isStillToCome("2026-09-02T18:00:00.000Z", now), false);
  });

  test("a session later today is still to come", () => {
    assert.equal(isStillToCome("2026-09-02T21:25:00.000Z", now), true);
  });

  test("no end time means not time-bound, not expired", () => {
    // A booth is staffed all day and a person is not scheduled at all.
    assert.equal(isStillToCome(null, now), true);
    assert.equal(isStillToCome(undefined, now), true);
  });

  test("an unparseable time is missing data, not an expiry", () => {
    assert.equal(isStillToCome("not a date", now), true);
  });

  test("accepts a Date as well as an ISO string", () => {
    assert.equal(isStillToCome(new Date("2026-09-02T17:00:00.000Z"), now), false);
    assert.equal(isStillToCome(new Date("2026-09-02T19:00:00.000Z"), now), true);
  });
});
