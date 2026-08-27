import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callForJson } from "./jsonRetry";

const schema = z.object({ x: z.string() });
const ok = JSON.stringify({ x: "fine" });

describe("callForJson", () => {
  test("extracts JSON wrapped in prose or code fences", () => {
    return callForJson(schema, async () => `Sure!\n\`\`\`json\n${ok}\n\`\`\``).then((r) =>
      assert.deepEqual(r, { x: "fine" })
    );
  });

  test("retries a malformed response and feeds back what was wrong", async () => {
    const notes: (string | undefined)[] = [];
    const result = await callForJson(schema, async (note) => {
      notes.push(note);
      return notes.length === 1 ? "not json at all" : ok;
    });

    assert.deepEqual(result, { x: "fine" });
    assert.equal(notes.length, 2);
    assert.equal(notes[0], undefined);
    // A bare "that was wrong" retry reliably reproduced the same mistake, so
    // the note has to carry the actual failure.
    assert.match(String(notes[1]), /previous response had this problem/i);
  });

  test("retries a schema violation", async () => {
    let calls = 0;
    await callForJson(schema, async () => {
      calls += 1;
      return calls === 1 ? JSON.stringify({ x: 42 }) : ok;
    });
    assert.equal(calls, 2);
  });

  test("gives up after one retry and preserves the cause", async () => {
    await assert.rejects(
      () => callForJson(schema, async () => "still not json"),
      (err: Error) => {
        assert.match(err.message, /did not match the expected shape/);
        assert.ok(err.cause, "cause must survive for error classification");
        return true;
      }
    );
  });

  describe("does not retry what a reworded prompt cannot fix", () => {
    const failsOnce = async (error: unknown) => {
      let calls = 0;
      await callForJson(schema, async () => {
        calls += 1;
        throw error;
      }).catch(() => {});
      return calls;
    };

    test("provider auth failure", async () => {
      assert.equal(await failsOnce(Object.assign(new Error("401"), { status: 401 })), 1);
    });

    test("provider at capacity", async () => {
      // The SDK has already retried this one with backoff by now.
      assert.equal(await failsOnce(Object.assign(new Error("503"), { status: 503 })), 1);
    });

    test("connection failure", async () => {
      assert.equal(
        await failsOnce(Object.assign(new Error("Connection error."), { name: "APIConnectionError" })),
        1
      );
    });
  });

  test("hard validate fails the call", async () => {
    // Ingestion's date-window check runs here. Accepting a hallucinated room or
    // time would corrupt the corpus permanently, so this path must throw.
    await assert.rejects(() =>
      callForJson(
        schema,
        async () => ok,
        () => {
          throw new Error("structurally wrong");
        }
      )
    );
  });

  test("soft validate retries, then accepts rather than losing the response", async () => {
    let calls = 0;
    const result = await callForJson(
      schema,
      async () => {
        calls += 1;
        return ok;
      },
      undefined,
      () => {
        throw new Error("a quality concern, not a correctness one");
      }
    );

    assert.deepEqual(result, { x: "fine" });
    assert.equal(calls, 2);
  });
});
