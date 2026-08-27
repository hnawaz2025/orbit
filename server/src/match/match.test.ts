import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filterCandidates } from "./filter";
import { rankCandidates, reachabilityFactor, scoreCandidate } from "./rank";
import { normaliseLevel, type Candidate } from "./types";

const NOW = new Date("2026-09-02T14:00:00-07:00");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000);

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "e1",
    kind: "TALK",
    title: "A talk",
    startsAt: minutes(60),
    endsAt: minutes(105),
    locationName: "Main Stage",
    level: null,
    isDurable: false,
    similarity: 0.5,
    linkedIds: [],
    ...overrides,
  };
}

describe("normaliseLevel", () => {
  test("reads the three dialects conferences actually use", () => {
    assert.equal(normaliseLevel("Beginner"), 1);
    assert.equal(normaliseLevel("101"), 1);
    assert.equal(normaliseLevel("Intermediate"), 2);
    assert.equal(normaliseLevel("200-level"), 2);
    assert.equal(normaliseLevel("Advanced"), 3);
    assert.equal(normaliseLevel("Deep dive"), 3);
  });

  test("returns null rather than guessing at an unknown label", () => {
    // Guessing here filters a session away from someone who wanted it.
    assert.equal(normaliseLevel("All welcome"), null);
    assert.equal(normaliseLevel("Track B"), null);
    assert.equal(normaliseLevel(null), null);
    assert.equal(normaliseLevel(""), null);
  });
});

describe("filterCandidates", () => {
  test("drops sessions that already ended and counts them", () => {
    const outcome = filterCandidates({
      candidates: [
        candidate({ id: "over", startsAt: minutes(-120), endsAt: minutes(-60) }),
        candidate({ id: "upcoming" }),
      ],
      now: NOW,
    });

    assert.deepEqual(outcome.kept.map((c) => c.id), ["upcoming"]);
    assert.equal(outcome.endedCount, 1);
  });

  test("keeps a session that is underway", () => {
    // Walking in late is a real option; ranking penalises it rather than
    // filtering removing it.
    const outcome = filterCandidates({
      candidates: [candidate({ id: "running", startsAt: minutes(-10), endsAt: minutes(35) })],
      now: NOW,
    });
    assert.deepEqual(outcome.kept.map((c) => c.id), ["running"]);
    assert.equal(outcome.endedCount, 0);
  });

  test("never expires an entity that is not time-bound", () => {
    // A booth and a person have no end time. Absent must not read as expired.
    const outcome = filterCandidates({
      candidates: [
        candidate({ id: "person", kind: "PERSON", startsAt: null, endsAt: null }),
        candidate({ id: "booth", kind: "BOOTH", startsAt: null, endsAt: null }),
      ],
      now: NOW,
    });
    assert.equal(outcome.kept.length, 2);
    assert.equal(outcome.endedCount, 0);
  });

  test("drops only a full-scale level mismatch", () => {
    const outcome = filterCandidates({
      candidates: [
        candidate({ id: "advanced", level: "Advanced" }),
        candidate({ id: "intermediate", level: "Intermediate" }),
        candidate({ id: "beginner", level: "Beginner" }),
      ],
      now: NOW,
      attendeeLevel: 1,
    });

    // One band of distance is left alone: the labels are self-assigned with no
    // shared rubric, so a one-step gap is not evidence of a bad match.
    assert.deepEqual(outcome.kept.map((c) => c.id).sort(), ["beginner", "intermediate"]);
    assert.equal(outcome.levelFilteredCount, 1);
  });

  test("ignores levels entirely when the attendee did not state one", () => {
    const outcome = filterCandidates({
      candidates: [candidate({ level: "Advanced" }), candidate({ id: "e2", level: "Beginner" })],
      now: NOW,
    });
    assert.equal(outcome.kept.length, 2);
    assert.equal(outcome.levelFilteredCount, 0);
  });

  test("an unparsed level never causes a drop", () => {
    const outcome = filterCandidates({
      candidates: [candidate({ level: "Track B" })],
      now: NOW,
      attendeeLevel: 1,
    });
    assert.equal(outcome.kept.length, 1);
  });
});

describe("reachabilityFactor", () => {
  test("full for anything not time-bound", () => {
    assert.equal(reachabilityFactor(candidate({ startsAt: null }), NOW), 1);
  });

  test("full when there is time to walk there", () => {
    assert.equal(reachabilityFactor(candidate({ startsAt: minutes(45) }), NOW), 1);
  });

  test("discounted when it starts inside the walk buffer", () => {
    assert.ok(reachabilityFactor(candidate({ startsAt: minutes(4) }), NOW) < 1);
  });

  test("discounted hardest when already underway", () => {
    const running = reachabilityFactor(candidate({ startsAt: minutes(-5) }), NOW);
    const tight = reachabilityFactor(candidate({ startsAt: minutes(4) }), NOW);
    assert.ok(running < tight);
  });
});

describe("scoreCandidate", () => {
  test("down-weights a recording against an identical live session", () => {
    // The product thesis, as arithmetic: the recording will exist next month.
    const live = scoreCandidate(candidate({ isDurable: false }), NOW);
    const recorded = scoreCandidate(candidate({ isDurable: true }), NOW);
    assert.ok(recorded < live);
  });

  test("a stronger match still beats the durability discount", () => {
    // The discount reorders near-ties; it must not bury an obviously better
    // answer just because it happens to be recorded.
    const recordedStrong = scoreCandidate(candidate({ isDurable: true, similarity: 0.9 }), NOW);
    const liveWeak = scoreCandidate(candidate({ isDurable: false, similarity: 0.5 }), NOW);
    assert.ok(recordedStrong > liveWeak);
  });
});

describe("rankCandidates", () => {
  test("orders by score and assigns 1-based ranks", () => {
    const ranked = rankCandidates(
      [
        candidate({ id: "weak", similarity: 0.2 }),
        candidate({ id: "strong", similarity: 0.9 }),
        candidate({ id: "middling", similarity: 0.5 }),
      ],
      NOW
    );

    assert.deepEqual(ranked.map((c) => c.id), ["strong", "middling", "weak"]);
    assert.deepEqual(ranked.map((c) => c.rank), [1, 2, 3]);
  });

  test("rewards a link only when the other end also matched", () => {
    const withPresentLink = rankCandidates(
      [candidate({ id: "a", linkedIds: ["b"] }), candidate({ id: "b" })],
      NOW
    ).find((c) => c.id === "a")!;

    const withAbsentLink = rankCandidates(
      [candidate({ id: "a", linkedIds: ["zzz"] }), candidate({ id: "b" })],
      NOW
    ).find((c) => c.id === "a")!;

    assert.ok(withPresentLink.score > withAbsentLink.score);
  });

  test("caps the link bonus so connectivity cannot promote a weak match", () => {
    const hub = candidate({
      id: "hub",
      similarity: 0.3,
      linkedIds: ["a", "b", "c", "d", "e", "f", "g"],
    });
    const others = ["a", "b", "c", "d", "e", "f", "g"].map((id) => candidate({ id }));
    const best = candidate({ id: "best", similarity: 0.9 });

    const ranked = rankCandidates([hub, best, ...others], NOW);
    assert.equal(ranked[0].id, "best");
  });

  test("is deterministic when scores tie", () => {
    const build = () => [candidate({ id: "b" }), candidate({ id: "a" }), candidate({ id: "c" })];
    const first = rankCandidates(build(), NOW).map((c) => c.id);
    const second = rankCandidates(build(), NOW).map((c) => c.id);
    assert.deepEqual(first, second);
  });

  test("ignores a self-referential link", () => {
    const ranked = rankCandidates([candidate({ id: "a", linkedIds: ["a"] })], NOW);
    assert.equal(ranked[0].score, scoreCandidate(candidate({ id: "a" }), NOW));
  });
});
