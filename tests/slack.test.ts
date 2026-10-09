import test from "node:test";
import assert from "node:assert/strict";
import {
  alertPayload,
  privateReason,
  sendSlackAlert,
  sendVisitorAlerts,
  urgentAlert,
} from "../src/lib/server/slack";
import {
  AirtableClient,
  type RecordRow,
} from "../src/lib/server/airtable-core";
import {
  logDecisions,
  parseBatch,
  type LogBatch,
} from "../src/lib/server/decisions";
import { loadData } from "../src/lib/load-data";
import { createDemo } from "../src/lib/demo";
const tickets = createDemo(loadData().tickets, 1700000000000).tickets;
const crisis = tickets.find((t) => t.ticket_id === "T-01")!;
const app = new URL("https://carevine.example");
const session = "11111111-1111-4111-8111-111111111111";

test("Block Kit crisis and clinical alerts contain the reason, private title and exact nurse link", () => {
  const payload = alertPayload(
    { ticket: crisis, receivedAt: 1700000000000 },
    app,
    1700000000000 + 2 * 1000,
  );
  assert.equal(
    payload.text,
    "🔴 URGENT · Crisis language · T-01 · arrived 2 sec ago",
  );
  assert.equal(
    payload.blocks[2].elements?.[0].url,
    "https://carevine.example/nurse?ticket=T-01",
  );
  assert.equal(
    payload.blocks[2].elements?.[0].text.text,
    "Open in nurse queue",
  );
  assert.ok(payload.blocks[1].text?.text.startsWith("Reason: "));
  assert.ok(!JSON.stringify(payload).includes(crisis.member_first_name));
  assert.ok(!JSON.stringify(payload).includes(crisis.message));
  const clinical = tickets.find((t) => t.ticket_id === "CV-10004")!;
  assert.equal(
    alertPayload(
      { ticket: clinical, receivedAt: 1700000000000 },
      app,
      1700000000000,
    ).text,
    "🟠 Clinical · CV-10004 · Low reading and symptoms · arrived just now",
  );
  assert.equal(
    urgentAlert({
      ...clinical.ai,
      priority: "normal",
      route: "Nurse - urgent",
    }),
    true,
  );
  assert.equal(
    urgentAlert({
      ...clinical.ai,
      priority: "urgent",
      route: "Member Support",
    }),
    true,
  );
  assert.equal(
    urgentAlert({ ...clinical.ai, priority: "high", route: "Nurse" }),
    false,
  );
});

test("admin alert ages start with the current receipt, not the seeded ticket, and count model/save time in seconds", () => {
  const receivedAt = 1700000000000;
  const stale = { ...crisis, received_at: receivedAt - 298 * 60000 };
  for (const [elapsed, expected] of [
    [0, "just now"],
    [999, "just now"],
    [1000, "1 sec ago"],
    [61000, "61 sec ago"],
    [-1000, "just now"],
  ] as const) {
    const payload = alertPayload(
      { ticket: stale, receivedAt },
      app,
      receivedAt + elapsed,
    );
    assert.equal(
      payload.text,
      `🔴 URGENT · Crisis language · T-01 · arrived ${expected}`,
    );
    assert.equal(payload.blocks[0].text?.text, payload.text);
    assert.ok(!JSON.stringify(payload).includes("298 min"));
  }
});

test("free-text reasons strip member names, message excerpts, flagged phrases and personal details", () => {
  const ticket = {
    ...crisis,
    member_first_name: "Sam",
    message:
      "Sam says I cannot deal with this anymore. My phone is 212-555-1234.",
  };
  const reason = privateReason(
    'Sam wrote "I cannot deal with this anymore". I CANNOT deal with this anymore. Contact sam@example.com, DOB 02/03/1980, M-1234567 or 212-555-1234 at 123 Main Street. ' +
      ticket.message,
    ticket,
  );
  for (const value of [
    "Sam",
    "I cannot deal",
    "I CANNOT deal",
    "sam@example.com",
    "02/03/1980",
    "M-1234567",
    "212-555-1234",
    "123 Main Street",
    ticket.message,
  ])
    assert.ok(!reason.includes(value), value);
  assert.equal(
    privateReason("Élodie needs review", {
      ...ticket,
      member_first_name: "Élodie",
    }),
    "[NAME] needs review",
  );
  const payload = alertPayload(
    {
      ticket,
      receivedAt: 1700000000000 - 120000,
      repReason: "Please assess the medication question",
      demo: true,
    },
    app,
    1700000000000,
  );
  assert.equal(
    payload.text,
    "[Demo] 🟠 Sent to nurse by support rep · T-01 · arrived 2 min ago",
  );
  assert.equal(
    payload.blocks[1].text?.text,
    "Reason: Please assess the medication question",
  );
  assert.equal(payload.blocks[1].text?.type, "plain_text");
});

test("Slack makes one bounded server request; HTTP and network failures never throw or expose credentials", async () => {
  const oldWebhook = process.env.SLACK_WEBHOOK_URL,
    oldApp = process.env.APP_URL;
  const oldError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => {
    logs.push(args);
  };
  process.env.SLACK_WEBHOOK_URL =
    "https://hooks.slack.com/services/test-secret";
  process.env.APP_URL = app.toString();
  try {
    let calls = 0;
    const failed = (async (_url: unknown, init: RequestInit) => {
      calls++;
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
      return new Response("sensitive-response", { status: 500 });
    }) as typeof fetch;
    assert.equal(
      await sendSlackAlert(
        { ticket: crisis, receivedAt: 1700000000000 },
        failed,
      ),
      "failed",
    );
    assert.equal(calls, 1);
    assert.equal(
      await sendSlackAlert(
        { ticket: crisis, receivedAt: 1700000000000 },
        (async () => {
          throw new Error("test-secret sensitive-response");
        }) as typeof fetch,
      ),
      "failed",
    );
    assert.equal(
      await sendSlackAlert(
        { ticket: crisis, receivedAt: 1700000000000 },
        (async () => new Response("ok")) as typeof fetch,
      ),
      "sent",
    );
    process.env.SLACK_WEBHOOK_URL = "https://untrusted.example/services/secret";
    assert.equal(
      await sendSlackAlert(
        { ticket: crisis, receivedAt: 1700000000000 },
        failed,
      ),
      "unconfigured",
    );
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(logs).includes("test-secret"));
    assert.ok(!JSON.stringify(logs).includes("sensitive-response"));
    assert.ok(!JSON.stringify(logs).includes(crisis.member_first_name));
  } finally {
    console.error = oldError;
    if (oldWebhook === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = oldWebhook;
    if (oldApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldApp;
  }
});

function quotaBase() {
  const rows: RecordRow[] = [];
  let reads = 0;
  const client = new AirtableClient(
    "fake",
    "appFake",
    (async (input: unknown, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "GET") {
        reads++;
        assert.equal(url.searchParams.get("maxRecords"), "3");
        assert.equal(url.searchParams.get("sort[0][field]"), "at");
        const visitor = url.searchParams
          .get("filterByFormula")!
          .match(/session_id}='([^']+)'/)![1];
        return Response.json({
          records: rows
            .filter(
              (r) =>
                r.fields.session_id === visitor &&
                r.fields.action === "sent_to_nurse" &&
                r.fields.role === "Support rep",
            )
            .sort((a, b) =>
              String(a.fields.at).localeCompare(String(b.fields.at)),
            )
            .slice(0, 3),
        });
      }
      const body = JSON.parse(String(init?.body));
      const records = body.records.map((r: RecordRow) => ({
        ...r,
        id: `rec${rows.length + 1}`,
      }));
      for (const record of records) {
        record.id = `rec${rows.length + 1}`;
        rows.push(record);
      }
      return Response.json({ records });
    }) as typeof fetch,
    false,
  );
  return { client, rows, reads: () => reads };
}

test("visitor transfer alert uses its validated session arrival and never writes that timing hint to Airtable", async () => {
  const base = quotaBase();
  const receivedAt = Date.now() - 7 * 60000;
  const batch = parseBatch(
    {
      session_id: session,
      events: [
        {
          ticket_id: "T-01",
          at: Date.now(),
          action: "sent_to_nurse",
          role: "Support rep",
          note: "Nurse review requested",
          ticket_received_at: receivedAt,
        },
      ],
    },
    ["T-01"],
  );
  assert.equal(batch.events[0].ticket_received_at, receivedAt);
  const saved = await logDecisions(base.client, batch, { "T-01": "recTicket" });
  assert.ok(!("ticket_received_at" in saved[0].fields));
  assert.equal(
    await sendVisitorAlerts(
      base.client,
      batch,
      saved,
      tickets,
      async (alert) => {
        assert.equal(alert.receivedAt, receivedAt);
        assert.match(
          alertPayload(alert, app, receivedAt + 7 * 60000).text,
          /arrived 7 min ago$/,
        );
        return "sent";
      },
    ),
    "sent",
  );
});

test("legacy visitors without the clock use the original demo wait, never the seed age", async () => {
  const base = quotaBase();
  const batch: LogBatch = {
    session_id: session,
    events: [
      {
        ticket_id: "T-01",
        at: 0,
        person: "Julia Lee",
        role: "Support rep",
        action: "sent_to_nurse",
        note: "Nurse review",
      },
    ],
  };
  const saved = await logDecisions(base.client, batch, { "T-01": "recTicket" });
  const before = Date.now();
  await sendVisitorAlerts(base.client, batch, saved, tickets, async (alert) => {
    assert.ok(alert.receivedAt >= before - crisis.demo_wait_min * 60000);
    assert.ok(alert.receivedAt <= Date.now() - crisis.demo_wait_min * 60000);
    assert.notEqual(alert.receivedAt, crisis.received_at);
    return "sent";
  });
});

test("public arrival hints reject invalid timestamps and allow legacy transfers without a hint", () => {
  const event = {
    ticket_id: "T-01",
    at: Date.now(),
    role: "Support rep",
    action: "sent_to_nurse",
    note: "Nurse review",
  };
  for (const ticket_received_at of [-1, Infinity, NaN, "now", 1e20])
    assert.throws(() =>
      parseBatch(
        { session_id: session, events: [{ ...event, ticket_received_at }] },
        ["T-01"],
      ),
    );
  assert.equal(
    parseBatch({ session_id: session, events: [event] }, ["T-01"]).events[0]
      .ticket_received_at,
    undefined,
  );
});

test("only the first three visitor transfers post Slack; all four Decisions survive, even after a reload/reset", async () => {
  const base = quotaBase();
  let sent = 0;
  const sender = async () => {
    sent++;
    return "sent" as const;
  };
  const batch: LogBatch = {
    session_id: session,
    events: [
      {
        ticket_id: "T-01",
        at: 0,
        person: "Julia Lee",
        role: "Support rep",
        action: "sent_to_nurse",
        note: "Nurse review requested",
      },
    ],
  };
  for (let i = 0; i < 4; i++) {
    const saved = await logDecisions(base.client, batch, {
      "T-01": "recTicket",
    });
    assert.ok(Date.parse(String(saved[0].fields.at)) > 0); // Client can't backdate the quota.
    const status = await sendVisitorAlerts(
      base.client,
      batch,
      saved,
      tickets,
      sender,
    );
    assert.equal(status, i < 3 ? "sent" : "limit");
  }
  assert.equal(sent, 3);
  assert.equal(base.rows.length, 4);
  const anotherVisitor = {
    ...batch,
    session_id: "22222222-2222-4222-8222-222222222222",
  };
  const saved = await logDecisions(base.client, anotherVisitor, {
    "T-01": "recTicket",
  });
  assert.equal(
    await sendVisitorAlerts(
      base.client,
      anotherVisitor,
      saved,
      tickets,
      sender,
    ),
    "sent",
  );
  const reads = base.reads();
  assert.equal(
    await sendVisitorAlerts(
      base.client,
      { ...batch, events: [{ ...batch.events[0], action: "draft_feedback" }] },
      [],
      tickets,
      sender,
    ),
    "none",
  );
  assert.equal(base.reads(), reads);
});

test("failed Slack attempts consume quota and failed quota reads skip Slack without losing Decisions", async () => {
  const base = quotaBase();
  const batch: LogBatch = {
    session_id: session,
    events: [
      {
        ticket_id: "T-01",
        at: Date.now(),
        person: "Julia Lee",
        role: "Support rep",
        action: "sent_to_nurse",
        note: "Nurse review",
      },
    ],
  };
  let attempts = 0;
  for (let i = 0; i < 4; i++) {
    const saved = await logDecisions(base.client, batch, {
      "T-01": "recTicket",
    });
    const status = await sendVisitorAlerts(
      base.client,
      batch,
      saved,
      tickets,
      async () => {
        attempts++;
        return "failed";
      },
    );
    assert.equal(status, i < 3 ? "failed" : "limit");
  }
  assert.equal(attempts, 3);
  const failedClient = new AirtableClient(
    "fake",
    "appFake",
    (async () => {
      throw new Error("offline");
    }) as typeof fetch,
    false,
  );
  assert.equal(
    await sendVisitorAlerts(
      failedClient,
      batch,
      base.rows.slice(0, 1),
      tickets,
      async () => {
        throw new Error("must not post");
      },
    ),
    "failed",
  );
  assert.equal(base.rows.length, 4);
});

test("public transfer requires a Support rep and a nonempty reason", () => {
  for (const event of [
    {
      ticket_id: "T-01",
      at: 0,
      action: "sent_to_nurse",
      role: "Nurse",
      note: "Review",
    },
    {
      ticket_id: "T-01",
      at: 0,
      action: "sent_to_nurse",
      role: "Support rep",
      note: " ",
    },
  ])
    assert.throws(() =>
      parseBatch({ session_id: session, events: [event] }, ["T-01"]),
    );
});
