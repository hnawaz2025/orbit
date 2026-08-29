import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  planDays,
  CUFF_H,
  MIN_BLOCK_H,
  PT_PER_MIN,
  type PlanItem,
} from "@orbit/shared";

// The geometry is where a calendar goes wrong, and a schedule that renders the
// wrong shape is worse than a list because it looks authoritative.

// Minutes from 09:00 on the conference day. Fractional hours do not survive
// the Date constructor, which is what broke the first version of this fixture.
const at = (minutes: number) => new Date(2026, 8, 2, 9, minutes).toISOString();
const DAY_KEY = new Date(2026, 8, 2).toDateString();

const item = (
  id: string,
  fromMin: number,
  toMin: number,
  overrides: Partial<PlanItem> = {}
): PlanItem => ({
  id,
  title: id,
  kind: "TALK",
  locationName: "Main Stage",
  startsAt: at(fromMin),
  endsAt: at(toMin),
  ...overrides,
});

describe("buildTimeline", () => {
  test("a 50-minute session is twice the height of a 25-minute one", () => {
    // Duration has to be readable as height, or the calendar is just a list
    // with lines on it.
    const { rows } = buildTimeline([item("long", 60, 120)], DAY_KEY);
    const group = rows.find((r) => r.kind === "group")!;
    assert.equal(group.height, Math.round(60 * PT_PER_MIN));
  });

  test("a short session is floored so its title still fits", () => {
    const { rows } = buildTimeline([item("short", 60, 85)], DAY_KEY);
    const group = rows.find((r) => r.kind === "group")!;
    assert.equal(group.height, MIN_BLOCK_H);
  });

  test("a short gap renders true to scale", () => {
    const { rows } = buildTimeline([item("a", 60, 120), item("b", 135, 180)], DAY_KEY);
    const gap = rows.find((r) => r.kind === "gap");
    assert.ok(gap && gap.kind === "gap");
    if (gap?.kind !== "gap") return;
    assert.equal(gap.collapsed, false);
    assert.equal(gap.minutes, 15);
    assert.equal(gap.height, Math.round(15 * PT_PER_MIN));
  });

  test("a long gap collapses to a fixed cuff that states its real length", () => {
    // A faithful day is three screens of mostly nothing. The cuff compresses
    // the pixels without hiding the fact.
    const { rows } = buildTimeline([item("a", 0, 60), item("b", 300, 360)], DAY_KEY);
    const gap = rows.find((r) => r.kind === "gap");
    if (gap?.kind !== "gap") return assert.fail("expected a gap");
    assert.equal(gap.collapsed, true);
    assert.equal(gap.height, CUFF_H);
    assert.equal(gap.minutes, 240);
  });

  test("colliding sessions become one group, not two rows", () => {
    const { rows } = buildTimeline([item("a", 60, 120), item("b", 90, 150)], DAY_KEY);
    const groups = rows.filter((r) => r.kind === "group");
    assert.equal(groups.length, 1);
    if (groups[0].kind !== "group") return;
    assert.equal(groups[0].collides, true);
    assert.equal(groups[0].items.length, 2);
  });

  test("three collisions draw two and offer the rest", () => {
    // Thirds would be 97pt, which cannot hold a session title.
    const { rows } = buildTimeline(
      [item("a", 60, 120), item("b", 75, 135), item("c", 90, 150)],
      DAY_KEY
    );
    const group = rows.find((r) => r.kind === "group")!;
    if (group.kind !== "group") return;
    assert.equal(group.items.length, 2);
    assert.equal(group.overflow, 1);
  });

  test("clusters transitively, so a chain is one decision", () => {
    // A overlaps B, B overlaps C, A and C do not touch. Drawing them as two
    // rows would imply an order they do not have.
    const { rows } = buildTimeline(
      [item("a", 60, 120), item("b", 105, 165), item("c", 150, 210)],
      DAY_KEY
    );
    assert.equal(rows.filter((r) => r.kind === "group").length, 1);
  });

  test("back-to-back sessions produce no gap row", () => {
    const { rows } = buildTimeline([item("a", 60, 120), item("b", 120, 180)], DAY_KEY);
    assert.equal(rows.filter((r) => r.kind === "gap").length, 0);
  });

  test("untimed entities leave the axis entirely", () => {
    // A person is not scheduled. Giving them a slot would invent one.
    const person: PlanItem = {
      id: "p", title: "Ada", kind: "PERSON",
      locationName: null, startsAt: null, endsAt: null,
    };
    const { rows, anytime } = buildTimeline([item("a", 60, 120), person], DAY_KEY);
    assert.deepEqual(anytime.map((i) => i.id), ["p"]);
    assert.equal(rows.filter((r) => r.kind === "group").length, 1);
  });

  test("only the requested day is laid out", () => {
    const other: PlanItem = { ...item("tomorrow", 60, 120), startsAt: new Date(2026, 8, 3, 10).toISOString(), endsAt: new Date(2026, 8, 3, 11).toISOString() };
    const { rows } = buildTimeline([item("today", 60, 120), other], DAY_KEY);
    const groups = rows.filter((r) => r.kind === "group");
    assert.equal(groups.length, 1);
    if (groups[0].kind !== "group") return;
    assert.equal(groups[0].items[0].id, "today");
  });
});

describe("planDays", () => {
  test("lists the days a plan touches, in order, ignoring untimed items", () => {
    const days = planDays([
      { ...item("b", 60, 120), startsAt: new Date(2026, 8, 3, 10).toISOString() },
      item("a", 60, 120),
      { id: "p", title: "Ada", kind: "PERSON", locationName: null, startsAt: null, endsAt: null },
    ]);
    assert.equal(days.length, 2);
    assert.equal(days[0], new Date(2026, 8, 2).toDateString());
  });
});
