import test from "node:test";
import assert from "node:assert/strict";
import { loadData, parseCSV, parseArticles } from "../src/lib/load-data";
import {
  createDemo,
  withVisitorClock,
  waiting,
  checkResult,
  supportSort,
  nurseSort,
  visibleDraft,
} from "../src/lib/demo";
import { mockResults } from "../src/lib/mock-results";
const { tickets, articles } = loadData();
test("imports all source records and actual help center titles", () => {
  assert.equal(tickets.length, 16);
  assert.equal(new Set(tickets.map((t) => t.ticket_id)).size, 16);
  assert.equal(articles.length, 18);
  assert.equal(
    articles.find((a) => a.id === "KB-012")?.title,
    "Is Carevine free?",
  );
  assert.equal(
    articles.find((a) => a.id === "KB-001")?.title,
    "Resetting your password",
  );
});
test("CSV quoting and article boundaries preserve content", () => {
  assert.deepEqual(parseCSV('a,b\r\n"quoted, value","a ""quote"""\r\n'), [
    { a: "quoted, value", b: 'a "quote"' },
  ]);
  assert.equal(
    parseArticles("## KB-001: One\n\nA\n---\n\n## KB-002: Two\n\nB")[1].body,
    "B",
  );
});
test("all 16 mock results pass required safety and routing checks", () => {
  for (const s of tickets) assert.deepEqual(checkResult(s), [], s.ticket_id);
  const results = Object.values(mockResults);
  assert.equal(results.filter((r) => r.route.startsWith("Nurse")).length, 5);
  assert.equal(results.filter((r) => r.draft_reply).length, 7);
  for (const r of results) {
    for (const id of r.article_ids)
      assert.ok(articles.some((a) => a.id === id));
    if (r.draft_reply) assert.ok(r.draft_reply.split(/\s+/).length <= 120);
  }
});
test("reset isolates mutable results, restores queues, and adds only greeting names", () => {
  const first = createDemo(tickets, 10000000);
  first.tickets[0].ai.category = "billing";
  first.decisions.push({
    ticket_id: "CV-10009",
    at: 1,
    person: "Julia Lee",
    role: "Support rep",
    action: "reply_sent",
  });
  const reset = createDemo(tickets, 10000000);
  assert.equal(reset.decisions.length, 0);
  assert.equal(reset.tickets[0].ai.category, "device");
  assert.equal(reset.tickets[0].received_at, 10000000 - 12 * 60000);
  assert.ok(visibleDraft(reset.tickets[0]).startsWith("Hi Daniel,"));
  for (const t of reset.tickets.filter((t) => t.queue === "Nurse"))
    assert.equal(t.ai.draft_reply, null);
});
test("crisis always leads both queues; other nurse support rows stay last", () => {
  const { tickets: demo } = createDemo(tickets);
  assert.equal(
    demo.filter((t) => t.queue === "Nurse").sort(nurseSort)[0].ticket_id,
    "T-01",
  );
  const support = demo.sort(supportSort);
  assert.equal(support[0].ticket_id, "T-01");
  assert.ok(support.slice(1, 12).every((t) => t.queue === "Support"));
  assert.ok(support.slice(12).every((t) => t.queue === "Nurse"));
});

test("visitor IDs remain random UUIDs on HTTP previews without randomUUID", async () => {
  const { randomSessionId } = await import("../src/lib/session");
  const source = {
    getRandomValues: crypto.getRandomValues.bind(crypto),
  } as Pick<Crypto, "getRandomValues">;
  const first = randomSessionId(source);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(first, randomSessionId(source));
});

test("visitor clock replaces seed-based waits, counts up and restarts without mutating the snapshot", () => {
  const seedTime = 1700000000000;
  const sessionStart = seedTime + 4 * 60 * 60000;
  const snapshot = createDemo(tickets, seedTime);
  const original = structuredClone(snapshot);
  const visitor = withVisitorClock(snapshot.tickets, sessionStart);
  const crisis = visitor.find((t) => t.ticket_id === "T-01")!;
  assert.equal(crisis.received_at, sessionStart - 2 * 60000);
  assert.equal(waiting(crisis, sessionStart), "2 min");
  assert.equal(waiting(crisis, sessionStart + 3 * 60000), "5 min");
  assert.equal(crisis.moved_at, crisis.received_at);
  for (const t of visitor)
    assert.equal(
      waiting(t, sessionStart),
      waiting(
        original.tickets.find((s) => s.ticket_id === t.ticket_id)!,
        seedTime,
      ),
    );
  const resetTime = sessionStart + 10 * 60000;
  const reset = withVisitorClock(snapshot.tickets, resetTime).find(
    (t) => t.ticket_id === "T-01",
  )!;
  assert.equal(waiting(reset, resetTime), "2 min");
  assert.equal(reset.received_at, resetTime - 2 * 60000);
  assert.deepEqual(snapshot, original);
});

test("restoring a visitor clock preserves their actions and human transfer timestamps", () => {
  const sessionStart = 1700000000000;
  const state = createDemo(tickets, sessionStart - 4 * 60 * 60000);
  const ticket = state.tickets[0];
  ticket.queue = "Nurse";
  ticket.status = "Claimed";
  ticket.claimed_by = "Maya Brooks, RN";
  ticket.moved_at = sessionStart + 60000;
  ticket.feedback = "Yes";
  const restored = withVisitorClock(state.tickets, sessionStart);
  assert.equal(
    restored[0].received_at,
    sessionStart - ticket.demo_wait_min * 60000,
  );
  for (const key of [
    "queue",
    "status",
    "claimed_by",
    "moved_at",
    "feedback",
  ] as const)
    assert.equal(restored[0][key], ticket[key]);
  assert.deepEqual(withVisitorClock(restored, sessionStart), restored);
});
