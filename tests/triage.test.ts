import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { aiSchema, aiJSONSchema } from "../src/lib/ai-schema";
import { redact, hasPersonalDetails, crisisMatches } from "../src/lib/redact";
import { callLLM, modelSettings, defaultTriageModel } from "../src/lib/llm";
import {
  safeResult,
  triageTicket,
  ticketState,
  recordTriage,
} from "../src/lib/server/triage";
import {
  signResult,
  verifyResult,
  parseRun,
  saveRun,
  publishRun,
} from "../src/lib/server/test-runs";
import { mapSnapshot } from "../src/lib/server/demo-data";
import {
  automaticChecks,
  testSummary,
  type TestResult,
} from "../src/lib/test-report";
import { mockResults } from "../src/lib/mock-results";
import { loadData } from "../src/lib/load-data";
import {
  AirtableClient,
  type RecordRow,
} from "../src/lib/server/airtable-core";
const { tickets: seeds } = loadData();
const runId = "11111111-1111-4111-8111-111111111111";
const password = "test-password";
const baseAI = () => structuredClone(mockResults["CV-10009"]);
const results = (): TestResult[] =>
  seeds.map((s) => ({
    ticket_id: s.ticket_id,
    ai: safeResult(mockResults[s.ticket_id], s.message, s.member_first_name).ai,
    valid_json: true,
    safety_override: false,
    model: defaultTriageModel,
    latency_ms: 1,
    run_at: new Date().toISOString(),
    warnings: [],
    record_id: `recAI${s.ticket_id}`,
    ticket_record_id: `rec${s.ticket_id}`,
    receipt: "",
  }));

test("schema matches every prompt field, rejects extra/missing keys and wrong enums, and requires nullable fields", () => {
  const json = aiJSONSchema as {
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
  const prompt = fs
    .readFileSync("prompts/system_prompt.md", "utf8")
    .split("OUTPUT:")[1];
  const keys = [...prompt.matchAll(/"([a-z_]+)":/g)].map((m) => m[1]);
  assert.deepEqual(Object.keys(json.properties), keys);
  assert.deepEqual(json.required, keys);
  assert.equal(json.additionalProperties, false);
  assert.equal(aiSchema.safeParse({ ...baseAI(), extra: 1 }).success, false);
  assert.equal(
    aiSchema.safeParse({ ...baseAI(), draft_reply: undefined }).success,
    false,
  );
  assert.equal(
    aiSchema.safeParse({ ...baseAI(), clinical: "maybe" }).success,
    false,
  );
});
test("redacts all personal-detail types without removing readings; repeat redaction is idempotent", () => {
  const input =
    "Hi Daniel, DOB: 1987-03-22, date of birth is March 22, 1987. born on 03/22/1987. Contact me at dan@example.com or (321) 555-1234. M-123456, member number is 987654, ID: ABC123456. I live at 123 Main Street Apt 2. My reading was 68 this morning.";
  const r = redact(input, "Daniel");
  for (const tag of ["NAME", "DOB", "EMAIL", "PHONE", "MEMBER ID", "ADDRESS"])
    assert.ok(r.text.includes(`[${tag}]`), r.text);
  for (const secret of [
    "Daniel",
    "1987",
    "dan@example.com",
    "555-1234",
    "123456",
    "987654",
    "123 Main",
  ])
    assert.ok(!r.text.includes(secret), r.text);
  assert.ok(r.text.includes("68 this morning"));
  assert.equal(redact(r.text, "Daniel").text, r.text);
});
test("every crisis phrase forces urgent nurse routing even after invalid JSON or support classification", () => {
  for (const phrase of [
    "hurt myself",
    "kill myself",
    "suicide",
    "end my life",
    "don't see the point",
    "chest pain",
    "can't breathe",
    "trouble breathing",
    "stroke",
    "fainted",
    "seizure",
  ]) {
    const safe = safeResult(
      baseAI(),
      phrase.toUpperCase().replaceAll("'", "’"),
      "Daniel",
    );
    assert.ok(crisisMatches(phrase).length);
    assert.equal(safe.ai.crisis, true);
    assert.equal(safe.ai.route, "Nurse - urgent");
    assert.equal(safe.ai.priority, "urgent");
    assert.equal(safe.ai.draft_reply, null);
    assert.equal(safe.safety_override, true);
  }
  for (const clinical of ["yes", "unsure"] as const) {
    const safe = safeResult(
      { ...baseAI(), clinical },
      "I feel dizzy",
      "Daniel",
    );
    assert.equal(safe.ai.draft_reply, null);
    assert.ok(safe.ai.route.startsWith("Nurse"));
  }
});
test("names are restored locally; any remaining tag, long number, email or phone removes draft", () => {
  assert.match(
    safeResult(baseAI(), "Set up cuff", "Daniel").ai.draft_reply!,
    /^Hi Daniel,/,
  );
  for (const leak of [
    "[DOB]",
    "[MEMBER ID]",
    "[UNKNOWN]",
    "[PHONE]",
    "[EMAIL]",
    "[ADDRESS]",
    "123456",
    "dan@example.com",
    "321-555-1234",
  ]) {
    const safe = safeResult(
      { ...baseAI(), draft_reply: `Hi [NAME], ${leak}` },
      "Set up cuff",
      "Daniel",
    );
    assert.equal(safe.ai.draft_reply, null, leak);
    assert.equal(ticketState(safe.ai).status, "Needs rep");
  }
  assert.equal(hasPersonalDetails("Hi Daniel, please open Settings."), false);
});
test("triage sends only redacted message and all articles; invalid output retries exactly once", async () => {
  const calls: unknown[][] = [];
  const outcome = await triageTicket(
    {
      message: "Daniel: DOB 03/22/1987, dan@example.com. Setup?",
      member_first_name: "Daniel",
    },
    async (...args) => {
      calls.push(args);
      return calls.length === 1 ? { ...baseAI(), extra: 1 } : baseAI();
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0][3], false);
  assert.equal(calls[1][3], true);
  assert.ok(String(calls[0][0]).includes("OUTPUT:"));
  assert.equal([...String(calls[0][1]).matchAll(/^## KB-/gm)].length, 18);
  assert.ok(!String(calls[0][2]).includes("Daniel"));
  assert.ok(!String(calls[0][2]).includes("1987"));
  assert.ok(!String(calls[0][2]).includes("example.com"));
  assert.equal(outcome.valid_json, true);
  assert.match(outcome.ai.draft_reply!, /^Hi Daniel,/);
});
test("invalid twice and transport failure produce safe fallback without extra model requests", async () => {
  let calls = 0;
  const failed = await triageTicket(
    { message: "Setup", member_first_name: "Daniel" },
    async () => {
      calls++;
      return null;
    },
  );
  assert.equal(calls, 2);
  assert.equal(failed.valid_json, false);
  assert.equal(ticketState(failed.ai).status, "Needs rep");
  calls = 0;
  const crisis = await triageTicket(
    { message: "I want to hurt myself", member_first_name: "Sam" },
    async () => {
      calls++;
      throw new Error("OpenAI request failed (429).");
    },
  );
  assert.equal(calls, 1);
  assert.equal(crisis.valid_json, false);
  assert.equal(crisis.ai.route, "Nurse - urgent");
  assert.equal(crisis.ai.draft_reply, null);
});
test("provider uses Responses strict schema, minimal supported randomness, no response storage and configurable model", async () => {
  const oldKey = process.env.OPENAI_API_KEY,
    oldModel = process.env.TRIAGE_MODEL;
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.TRIAGE_MODEL = defaultTriageModel;
  try {
    let count = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      count++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, defaultTriageModel);
      assert.equal(body.temperature, 0);
      assert.equal(body.reasoning.effort, "none");
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.type, "json_schema");
      assert.deepEqual(body.text.format.schema, aiJSONSchema);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(baseAI()) }],
          },
        ],
      });
    };
    assert.deepEqual(
      await callLLM("system", "articles", "cleaned", false, fetcher),
      baseAI(),
    );
    assert.equal(count, 1);
    assert.equal(
      (modelSettings("gpt-6-astra") as { temperature?: number }).temperature,
      undefined,
    );
    assert.equal(
      (modelSettings("gpt-5-mini") as { temperature?: number }).temperature,
      undefined,
    );
    assert.equal(
      await callLLM("s", "a", "m", false, async () =>
        Response.json({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
      ),
      null,
    );
    await assert.rejects(
      callLLM(
        "s",
        "a",
        "m",
        false,
        async () => new Response("secret provider details", { status: 429 }),
      ),
      /429/,
    );
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.TRIAGE_MODEL;
    else process.env.TRIAGE_MODEL = oldModel;
  }
});
test("server result receipts reject tampering, expired results, cross-run results and duplicate tickets", () => {
  const r = results()[0],
    now = Date.now();
  const receipt = signResult(r, runId, password, now);
  assert.equal(
    verifyResult(receipt, runId, password, now).ticket_id,
    r.ticket_id,
  );
  assert.throws(() => verifyResult(receipt + "a", runId, password, now));
  assert.throws(() =>
    verifyResult(
      receipt,
      "22222222-2222-4222-8222-222222222222",
      password,
      now,
    ),
  );
  assert.throws(() =>
    verifyResult(receipt, runId, password, now + 8 * 3600000),
  );
  assert.throws(() =>
    parseRun({ run_id: runId, receipts: [receipt, receipt] }, seeds, password),
  );
  assert.throws(() =>
    parseRun(
      { run_id: runId, receipts: [receipt], reviews: { unknown: true } },
      seeds,
      password,
    ),
  );
});
test("required summary reflects actual results and manual reviews, not hardcoded mock pass counts", () => {
  const all = results();
  assert.equal(testSummary(seeds, [], {}).requiredPassed, false);
  const summary = testSummary(
    seeds,
    all,
    Object.fromEntries(
      all.filter((r) => r.ai.draft_reply).map((r) => [r.ticket_id, true]),
    ),
  );
  assert.equal(summary.requiredPassed, true);
  assert.equal(summary.passed, 16);
  assert.equal(summary.accurate, 7);
  const clinical = all.find((r) => r.ticket_id === "CV-10004")!;
  clinical.ai.draft_reply = "Unsafe reply";
  assert.ok(
    automaticChecks(
      seeds.find((s) => s.ticket_id === clinical.ticket_id)!,
      clinical,
    ).includes("Unsafe draft"),
  );
  assert.equal(testSummary(seeds, all, {}).clinicalPassed, 4);
  all[0].valid_json = false;
  assert.equal(testSummary(seeds, all, {}).privacyPassed, 15);
});
function memoryClient() {
  const calls: {
    table: string;
    method: string;
    body?: { records: RecordRow[] };
  }[] = [];
  const data: Record<string, RecordRow[]> = {
    "AI Results": [],
    Tickets: [],
    "KB Gaps": [],
    "Test Runs": [],
  };
  const client = new AirtableClient(
    "test-token",
    "appTest",
    async (url, init) => {
      const table = decodeURIComponent(
        new URL(String(url)).pathname.split("/").at(-1)!,
      );
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ table, method, body });
      if (method === "GET") return Response.json({ records: data[table] });
      if (method === "DELETE") {
        const ids = new URL(String(url)).searchParams.getAll("records[]");
        data[table] = data[table].filter((r) => !ids.includes(r.id));
        return Response.json({
          records: ids.map((id) => ({ id, deleted: true })),
        });
      }
      assert.ok(body.records.length <= 10);
      const rows = body.records.map((row: RecordRow, i: number) => {
        const stored = {
          id: row.id || `rec${table}${calls.length}-${i}`,
          fields: row.fields,
        };
        const index = data[table].findIndex((r) => r.id === stored.id);
        if (index >= 0) data[table][index] = stored;
        else data[table].push(stored);
        return stored;
      });
      return Response.json({ records: rows });
    },
    false,
  );
  return { client, data, calls };
}
test("each live triage appends one AI Results row, updates live ticket status and logs its gap", async () => {
  const f = memoryClient();
  const outcome = await triageTicket(
    { message: "setup", member_first_name: "Daniel" },
    async () => ({ ...baseAI(), kb_gap: "Missing detail" }),
  );
  await recordTriage(f.client, outcome, "recTicket");
  assert.equal(f.data["AI Results"].length, 1);
  assert.equal(f.data["KB Gaps"].length, 1);
  assert.equal(f.calls.length, 3);
  assert.equal(f.data.Tickets.length, 1);
  assert.equal(f.data.Tickets[0].fields.status, "Draft ready");
  assert.equal(f.data["KB Gaps"][0].fields.flagged_by, "Triage Tool");
});
test("save persists automatic counts and each ✓/✗ without setting the autonumber id", async () => {
  const f = memoryClient(),
    all = results();
  const drafts = all.filter((r) => r.ai.draft_reply);
  await saveRun(
    f.client,
    seeds,
    all,
    { [drafts[0].ticket_id]: true, [drafts[1].ticket_id]: false },
    runId,
  );
  assert.equal(f.calls.length, 1);
  const row = f.data["Test Runs"][0].fields;
  assert.equal(row.id, undefined);
  assert.equal(row.passed, 16);
  assert.equal(row.failed, 0);
  const notes = JSON.parse(String(row.notes));
  assert.equal(notes.tickets.length, 16);
  assert.equal(
    notes.tickets.find(
      (t: { ticket: string }) => t.ticket === drafts[0].ticket_id,
    ).accuracy,
    "✓",
  );
  assert.equal(
    notes.tickets.find(
      (t: { ticket: string }) => t.ticket === drafts[1].ticket_id,
    ).accuracy,
    "✗",
  );
});
test("only explicit publication changes the demo; historical live results remain and writes are batched", async () => {
  const f = memoryClient(),
    all = results();
  const now = Date.now();
  f.data.Tickets = seeds.map((s) => ({
    id: `rec${s.ticket_id}`,
    fields: {
      ...s,
      received_at: new Date(now).toISOString(),
      queue: ticketState(mockResults[s.ticket_id]).queue,
      status: ticketState(mockResults[s.ticket_id]).status,
    },
  }));
  f.data["AI Results"] = all.map((r) => ({
    id: `demo${r.ticket_id}`,
    fields: {
      ticket: [r.ticket_record_id],
      model: "phase-1-mock",
      run_at: r.run_at,
      raw_json: JSON.stringify(r.ai),
    },
  }));
  const original = mapSnapshot(
    seeds,
    f.data.Tickets,
    f.data["AI Results"],
    now,
  );
  f.data.Tickets[0].fields.status = "With nurse";
  f.data.Tickets[0].fields.queue = "Nurse";
  assert.equal(
    mapSnapshot(seeds, f.data.Tickets, f.data["AI Results"], now).tickets[0]
      .queue,
    "Support",
  );
  const changed = all[0];
  changed.ai.draft_reply = "Hi Daniel, this is the real result.";
  f.data["AI Results"].push({
    id: "live-later",
    fields: {
      ticket: [changed.ticket_record_id],
      model: defaultTriageModel,
      run_at: new Date(now + 1000).toISOString(),
      raw_json: JSON.stringify(changed.ai),
    },
  });
  assert.equal(
    mapSnapshot(seeds, f.data.Tickets, f.data["AI Results"], now).tickets[0].ai
      .draft_reply,
    original.tickets[0].ai.draft_reply,
  );
  await assert.rejects(publishRun(f.client, seeds, all.slice(0, 15)));
  assert.equal(f.calls.length, 0);
  await publishRun(f.client, seeds, all);
  assert.ok(f.data["AI Results"].some((r) => r.id === "live-later"));
  assert.equal(
    f.data["AI Results"].filter((r) =>
      String(r.fields.model).startsWith("demo:"),
    ).length,
    16,
  );
  assert.equal(
    mapSnapshot(
      seeds,
      f.data.Tickets.map((r) => ({
        ...r,
        fields: {
          ...seeds.find((s) => `rec${s.ticket_id}` === r.id),
          ...r.fields,
          received_at: new Date(now).toISOString(),
        },
      })),
      f.data["AI Results"],
      now,
    ).tickets[0].ai.draft_reply,
    changed.ai.draft_reply,
  );
  assert.ok(
    f.calls.every((c) => !["Decisions", "Test Runs"].includes(c.table)),
  );
});
