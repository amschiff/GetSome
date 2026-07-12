import assert from "node:assert/strict";
import test from "node:test";

await import("../capture-core.js");

const { collectVirtualized } = globalThis.GetSomeCaptureCore;

function makeVirtualizedFixture({ missingKey = "" } = {}) {
  const turns = Array.from({ length: 48 }, (_value, index) => ({
    key: `turn-${index + 1}`,
    order: index + 1,
    position: index * 100,
    markdown: index === 13
      ? "| Property | Judgment |\n| --- | --- |\n| Raffles | Definitely |"
      : index === 20
        ? "![uploaded apartment screenshots](https://example.test/upload.png)\n\nWhat are these?"
        : `Turn ${index + 1}`,
    text: `Turn ${index + 1}`,
  }));
  const viewport = 500;
  const maximum = turns.at(-1).position + 100 - viewport;
  let position = maximum;
  let moveCalls = 0;
  let maxMounted = 0;
  const visited = [];

  return {
    turns,
    get moveCalls() { return moveCalls; },
    get maxMounted() { return maxMounted; },
    get visited() { return visited; },
    options: {
      snapshot: async () => {
        const records = turns.filter((turn) => (
          turn.key !== missingKey
          && turn.position >= position - 120
          && turn.position <= position + viewport + 120
        ));
        maxMounted = Math.max(maxMounted, records.length);
        return {
          expected: turns.map(({ key, order, position: turnPosition }) => ({ key, order, position: turnPosition })),
          records,
        };
      },
      moveTo: async (requested, attempt) => {
        moveCalls += 1;
        visited.push({ requested, attempt });
        // Simulate a browser that ignores the first request for every slice.
        if (attempt === 0) return;
        position = Math.min(Math.max(0, requested), maximum);
      },
      currentPosition: () => position,
      maxPosition: () => maximum,
      viewportSize: () => viewport,
      settle: async () => {},
      retryCount: 3,
      maxMilliseconds: 10_000,
      maxSteps: 500,
    },
  };
}

test("collects a complete virtualized chat whose mounted slices repeatedly disappear", async () => {
  const fixture = makeVirtualizedFixture();
  const result = await collectVirtualized(fixture.options);

  assert.equal(result.complete, true);
  assert.equal(result.expectedCount, 48);
  assert.equal(result.records.length, 48);
  assert.ok(fixture.maxMounted < 10, "only a small transient slice may exist at once");
  assert.deepEqual(result.records.map((record) => record.key), fixture.turns.map((turn) => turn.key));
  assert.match(result.records[13].markdown, /\| Property \| Judgment \|/);
  assert.match(result.records[20].markdown, /uploaded apartment screenshots/);
  assert.ok(fixture.visited.some(({ requested }) => requested === 0), "traversal must restart at the real top");
  assert.ok(fixture.visited.some(({ requested }) => requested === 4_300), "traversal must reach the real bottom");
  assert.ok(fixture.moveCalls > 20, "ignored scrolls must be retried instead of aborting");
});

test("returns the best partial transcript only after targeted retries are exhausted", async () => {
  const fixture = makeVirtualizedFixture({ missingKey: "turn-17" });
  const result = await collectVirtualized(fixture.options);

  assert.equal(result.complete, false);
  assert.deepEqual(result.missingKeys, ["turn-17"]);
  assert.equal(result.records.length, 47);
  assert.ok(fixture.visited.filter(({ requested }) => requested === 1_600).length >= 2);
});
