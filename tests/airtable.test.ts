import test from "node:test";
import assert from "node:assert/strict";
import {
  AirtableClient,
  AirtableError,
  type Table,
  type RecordRow,
  type Fields,
} from "../src/lib/server/airtable-core";
import { expectedSchema, ensureSchema } from "../src/lib/server/schema";
import {
  readSnapshot,
  seedDemo,
  mapSnapshot,
} from "../src/lib/server/demo-data";
import { logDecisions, parseBatch } from "../src/lib/server/decisions";
import {
  passwordsMatch,
  signAdminCookie,
  verifyAdminCookie,
} from "../src/lib/server/auth-token";
import { loadData } from "../src/lib/load-data";
import { crisisTemplate } from "../src/lib/mock-results";
const seeds = loadData().tickets;
const session = "11111111-1111-4111-8111-111111111111";
function fakeBase() {
  const tables: Table[] = Object.entries(expectedSchema("tblTickets")).map(
    ([name, fields]) => ({
      name,
      id: name === "Tickets" ? "tblTickets" : `tbl${name.replaceAll(" ", "")}`,
      fields: structuredClone(fields),
    }),
  );
  const data: Record<string, RecordRow[]> = Object.fromEntries(
    tables.map((t) => [t.name, []]),
  );
  const calls: { method: string; path: string; body?: Fields }[] = [];
  let sequence = 0;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)),
      path = decodeURIComponent(url.pathname.slice("/v0/".length));
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer test-token",
    );
    calls.push({ method, path, body });
    if (path === "meta/bases/appTest/tables") return Response.json({ tables });
    if (path.startsWith("meta/")) {
      const table = tables.find((t) => t.id === path.split("/")[4])!;
      table.fields.push(body);
      return Response.json(body);
    }
    const table = path.split("/").slice(1).join("/");
    if (method === "GET") return Response.json({ records: data[table] });
    if (method === "DELETE") {
      const ids = url.searchParams.getAll("records[]");
      assert.ok(ids.length <= 10);
      data[table] = data[table].filter((r) => !ids.includes(r.id));
      return Response.json({
        records: ids.map((id) => ({ id, deleted: true })),
      });
    }
    assert.ok(body.records.length <= 10);
    const result = body.records.map((row: RecordRow) => {
      const merge = body.performUpsert?.fieldsToMergeOn[0];
      let match = row.id
        ? data[table].find((r) => r.id === row.id)
        : merge
          ? data[table].find((r) => r.fields[merge] === row.fields[merge])
          : undefined;
      if (!match) {
        match = { id: `rec${++sequence}`, fields: {} };
        data[table].push(match);
      }
      Object.assign(match.fields, row.fields);
      return structuredClone(match);
    });
    return Response.json({ records: result });
  };
  return {
    tables,
    data,
    calls,
    client: new AirtableClient(
      "test-token",
      "appTest",
      fetcher as typeof fetch,
      false,
    ),
  };
}
test("schema creates only missing fields and reports type/link mismatches without changing them", async () => {
  const f = fakeBase();
  const decisions = f.tables.find((t) => t.name === "Decisions")!;
  decisions.fields = decisions.fields.filter(
    (field) => field.name !== "session_id",
  );
  const gap = f.tables
    .find((t) => t.name === "KB Gaps")!
    .fields.find((field) => field.name === "gap")!;
  gap.type = "singleLineText";
  const report = await ensureSchema(f.client);
  assert.deepEqual(report.created, ["Decisions.session_id"]);
  assert.equal(report.ready, false);
  assert.equal(report.mismatches.length, 1);
  assert.equal(gap.type, "singleLineText");
  assert.equal(f.calls.filter((c) => c.method === "PATCH").length, 0);
  gap.type = "multilineText";
  assert.equal((await ensureSchema(f.client)).ready, true);
});
test("seeding upserts 16 tickets, replaces duplicate mocks, preserves visitor gaps and clears Decisions in batches", async () => {
  const f = fakeBase(),
    now = 1700000000000;
  f.data.Decisions = Array.from({ length: 23 }, (_, i) => ({
    id: `old${i}`,
    fields: {},
  }));
  const first = await seedDemo(f.client, seeds, now);
  assert.equal(first.tickets, 16);
  assert.equal(first.results, 16);
  assert.equal(first.decisions_deleted, 23);
  assert.equal(f.data.Decisions.length, 0);
  const ticket = f.data.Tickets.find((r) => r.fields.ticket_id === "CV-10009")!;
  assert.equal(
    ticket.fields.received_at,
    new Date(now - 12 * 60000).toISOString(),
  );
  assert.equal(f.data["AI Results"].length, 16);
  const duplicate = structuredClone(f.data["AI Results"][0]);
  duplicate.id = "duplicate";
  f.data["AI Results"].push(duplicate);
  f.data["KB Gaps"].push({
    id: "visitorGap",
    fields: {
      ticket: [ticket.id],
      gap: "visitor",
      flagged_by: "Julia Lee",
      session_id: session,
    },
  });
  await seedDemo(f.client, seeds, now + 60000);
  assert.equal(f.data.Tickets.length, 16);
  assert.equal(f.data["AI Results"].length, 16);
  assert.ok(f.data["KB Gaps"].some((r) => r.id === "visitorGap"));
  const snapshot = await readSnapshot(f.client, seeds);
  assert.equal(snapshot.offline, false);
  assert.equal(snapshot.tickets.length, 16);
  assert.equal(snapshot.tickets.filter((t) => t.queue === "Nurse").length, 5);
  assert.equal(
    snapshot.tickets.filter((t) => t.status === "Draft ready").length,
    7,
  );
  const writes = f.calls.filter((c) => c.body?.records);
  assert.ok(writes.every((c) => (c.body!.records as unknown[]).length <= 10));
});
test("decision batches log session and exact crisis text; checked gaps create a row without mutating tickets", async () => {
  const f = fakeBase();
  await seedDemo(f.client, seeds);
  const snapshot = await readSnapshot(f.client, seeds);
  f.calls.length = 0;
  const batch = parseBatch(
    {
      session_id: session,
      events: [
        {
          ticket_id: "T-01",
          at: Date.now(),
          action: "crisis_reply_sent",
          role: "Nurse",
          person: "forged",
          final_reply: "bad",
        },
        {
          ticket_id: "T-03",
          at: Date.now(),
          action: "gap_flagged",
          role: "Support rep",
          gap: { article_ids: ["KB-003"], text: "Spanish article needed" },
        },
        {
          ticket_id: "CV-10009",
          at: Date.now(),
          action: "draft_feedback",
          role: "Support rep",
          draft_useful: "Yes",
        },
      ],
    },
    seeds.map((s) => s.ticket_id),
  );
  await logDecisions(f.client, batch, snapshot.recordIds);
  assert.equal(f.calls.length, 2);
  assert.ok(
    f.calls.every(
      (c) => c.path.endsWith("Decisions") || c.path.endsWith("KB Gaps"),
    ),
  );
  assert.equal(f.data.Decisions[0].fields.final_reply, crisisTemplate);
  assert.equal(f.data.Decisions[0].fields.person, "Maya Brooks, RN");
  assert.ok(f.data.Decisions.every((r) => r.fields.session_id === session));
  assert.equal(f.data.Decisions[2].fields.draft_useful, "Yes");
  assert.equal(f.data["KB Gaps"].at(-1)!.fields.session_id, session);
});
test("invalid sessions, unknown actions/tickets and oversized batches are rejected before any call", () => {
  for (const payload of [
    { session_id: "bad", events: [] },
    { session_id: session, events: Array(11).fill({}) },
    {
      session_id: session,
      events: [{ action: "delete", ticket_id: "CV-10009" }],
    },
  ])
    assert.throws(() =>
      parseBatch(
        payload,
        seeds.map((s) => s.ticket_id),
      ),
    );
});
test("Airtable 429 makes one attempt; incomplete/invalid snapshots fail for offline fallback", async () => {
  let calls = 0;
  const client = new AirtableClient(
    "test",
    "app",
    (async () => {
      calls++;
      return Response.json({ error: "secret-response" }, { status: 429 });
    }) as typeof fetch,
    false,
  );
  await assert.rejects(
    client.list("Tickets"),
    (error: unknown) =>
      error instanceof AirtableError &&
      error.status === 429 &&
      !error.message.includes("secret-response"),
  );
  assert.equal(calls, 1);
  assert.throws(() => mapSnapshot(seeds, [], []));
  const f = fakeBase();
  await seedDemo(f.client, seeds);
  f.data["AI Results"][0].fields.raw_json = "not json";
  await assert.rejects(readSnapshot(f.client, seeds));
});
test("signed admin sessions expire, reject tampering/password changes and never contain the password", () => {
  const now = 1700000000000,
    password = "test-only-password";
  const cookie = signAdminCookie(password, now);
  assert.equal(cookie.includes(password), false);
  assert.equal(verifyAdminCookie(cookie, password, now + 1), true);
  assert.equal(
    verifyAdminCookie(cookie, password, now + 8 * 60 * 60 * 1000),
    false,
  );
  assert.equal(verifyAdminCookie(cookie + "0", password, now), false);
  assert.equal(verifyAdminCookie(cookie, "changed-password", now), false);
  assert.equal(verifyAdminCookie(undefined, password), false);
  assert.equal(passwordsMatch(password, password), true);
  assert.equal(passwordsMatch("no", password), false);
});

test("record reads follow Airtable pagination with a 100-row page size", async () => {
  const offsets: (string | null)[] = [];
  const client = new AirtableClient(
    "test",
    "app",
    (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      offsets.push(url.searchParams.get("offset"));
      assert.equal(url.searchParams.get("pageSize"), "100");
      return Response.json(
        offsets.length === 1
          ? { records: [{ id: "first", fields: {} }], offset: "next-page" }
          : { records: [{ id: "second", fields: {} }] },
      );
    }) as typeof fetch,
    false,
  );
  assert.equal((await client.list("Tickets")).length, 2);
  assert.deepEqual(offsets, [null, "next-page"]);
});
test("schema stops further writes after a permission error to conserve calls", async () => {
  const schema = Object.entries(expectedSchema("tblTickets")).map(([name]) => ({
    name,
    id: name === "Tickets" ? "tblTickets" : name,
    fields: [],
  }));
  let writes = 0;
  const client = new AirtableClient(
    "test",
    "app",
    (async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "GET") return Response.json({ tables: schema });
      writes++;
      return Response.json({}, { status: 403 });
    }) as typeof fetch,
    false,
  );
  const report = await ensureSchema(client);
  assert.equal(report.ready, false);
  assert.equal(writes, 1);
  assert.ok(report.missing.length > 2);
});
