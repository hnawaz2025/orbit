// A bounded-concurrency map, kept apart from the adapter that uses it.
//
// Deliberately free of imports. The adapter reaches the model client, which
// validates configuration at module scope and exits when a key is missing --
// so a pure utility living beside it cannot be tested without secrets, and
// "at most N at a time" is a correctness property worth testing: N is a paid
// provider's plan ceiling, and exceeding it turns a working ingest into a wall
// of 429s.

/**
 * Run `worker` over every item, at most `limit` at a time.
 *
 * A pool rather than batches of `limit`: batching stalls on the slowest member
 * of each group, and extraction time varies several-fold with how many sessions
 * a chunk happens to contain.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
