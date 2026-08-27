import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapWithLimit } from "./concurrency";

// Concurrency here is bounded by a paid provider's plan ceiling, so "at most N
// at a time" is a correctness property, not a performance preference --
// exceeding it turns a working ingest into a wall of 429s.

describe("mapWithLimit", () => {
  test("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return n;
    });

    assert.ok(peak <= 3, `peak concurrency was ${peak}, limit was 3`);
  });

  test("preserves input order regardless of completion order", async () => {
    // Chunk extraction time varies several-fold with how many sessions a chunk
    // contains, so results routinely finish out of order.
    const result = await mapWithLimit([30, 5, 20, 1], 4, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });

    assert.deepEqual(result, [30, 5, 20, 1]);
  });

  test("processes every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 2, async (n) => {
      seen.push(n);
      return n;
    });

    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  });

  test("passes the index through", async () => {
    const result = await mapWithLimit(["a", "b", "c"], 2, async (item, index) => `${index}:${item}`);
    assert.deepEqual(result, ["0:a", "1:b", "2:c"]);
  });

  test("handles an empty list without hanging", async () => {
    assert.deepEqual(await mapWithLimit([], 3, async (n) => n), []);
  });

  test("handles a limit larger than the list", async () => {
    assert.deepEqual(await mapWithLimit([1, 2], 10, async (n) => n * 2), [2, 4]);
  });
});
