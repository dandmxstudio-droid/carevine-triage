import test from "node:test";
import assert from "node:assert/strict";
import {
  SessionWriteGate,
  withinWriteQuota,
  publicWriteLimits,
} from "../src/lib/server/public-limits";
import { AirtableClient } from "../src/lib/server/airtable-core";
import type { LogBatch } from "../src/lib/server/decisions";
const session = "11111111-1111-4111-8111-111111111111";
const batch: LogBatch = {
  session_id: session,
  events: [
    {
      ticket_id: "T-01",
      at: 1,
      person: "Maya Brooks, RN",
      role: "Nurse",
      action: "call_logged",
    },
  ],
};
function fakeQuota(decisions: number, gaps = 0) {
  const calls: string[] = [];
  const client = new AirtableClient(
    "fake",
    "appFake",
    (async (input: unknown, init?: RequestInit) => {
      assert.equal(init?.method, "GET");
      const url = new URL(String(input));
      assert.equal(
        url.searchParams.get("filterByFormula"),
        `{session_id}='${session}'`,
      );
      const table = decodeURIComponent(url.pathname.split("/").at(-1)!);
      calls.push(table);
      const limit =
        table === "Decisions"
          ? publicWriteLimits.decisions
          : publicWriteLimits.gaps;
      assert.equal(url.searchParams.get("maxRecords"), String(limit + 1));
      return Response.json({
        records: Array.from(
          {
            length: Math.min(
              table === "Decisions" ? decisions : gaps,
              limit + 1,
            ),
          },
          (_, i) => ({ id: `rec${i}`, fields: {} }),
        ),
      });
    }) as typeof fetch,
    false,
  );
  return { client, calls };
}
test("public burst guard isolates sessions, rejects concurrent requests and renews only the timed window", () => {
  const gate = new SessionWriteGate();
  const release = gate.begin(session, 0)!;
  assert.ok(release);
  assert.equal(gate.begin(session, 0), null);
  const second = gate.begin("another", 0)!;
  assert.ok(second);
  second();
  release();
  for (let i = 1; i < publicWriteLimits.requests; i++) {
    const permit = gate.begin(session, 100)!;
    assert.ok(permit);
    permit();
  }
  assert.equal(gate.begin(session, 59999), null);
  const renewed = gate.begin(session, 60000)!;
  assert.ok(renewed);
  renewed();
});
test("durable Decision cap permits the last row, refuses the next batch and survives a new gate instance", async () => {
  const last = fakeQuota(99);
  assert.equal(await withinWriteQuota(last.client, batch), true);
  assert.deepEqual(last.calls, ["Decisions"]);
  assert.equal(
    await withinWriteQuota(last.client, {
      ...batch,
      events: [...batch.events, ...batch.events],
    }),
    false,
  );
  const full = fakeQuota(100);
  const restarted = new SessionWriteGate();
  assert.ok(restarted.begin(session, 0));
  assert.equal(await withinWriteQuota(full.client, batch), false);
  assert.deepEqual(full.calls, ["Decisions"]);
});
test("checked gap writes have their own cap; ordinary Decisions do not need a gap read", async () => {
  const gapBatch: LogBatch = {
    ...batch,
    events: [
      {
        ...batch.events[0],
        action: "gap_flagged",
        gap: { text: "Missing article", article_ids: [] },
      },
    ],
  };
  const last = fakeQuota(0, 9);
  assert.equal(await withinWriteQuota(last.client, gapBatch), true);
  assert.deepEqual(last.calls, ["Decisions", "KB Gaps"]);
  const full = fakeQuota(0, 10);
  assert.equal(await withinWriteQuota(full.client, gapBatch), false);
  assert.equal(await withinWriteQuota(full.client, batch), true);
});
test("quota read failures fail closed before any write or Slack alert", async () => {
  const client = new AirtableClient(
    "fake",
    "appFake",
    (async () => {
      throw new Error("offline");
    }) as typeof fetch,
    false,
  );
  await assert.rejects(withinWriteQuota(client, batch));
});
