import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { aiSchema } from "../ai-schema";
import { automaticChecks, testSummary, type TestResult } from "../test-report";
import { resultFields, ticketState, type TriageOutcome } from "./triage";
import type { AirtableClient } from "./airtable-core";
import type { SeedTicket } from "../types";
import { isDemoResult, demoResultsFormula } from "./demo-results";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validRunId = (id: unknown): id is string =>
  typeof id === "string" && uuid.test(id);
type Receipt = Omit<TestResult, "receipt"> & {
  run_id: string;
  expires: number;
};
export function signResult(
  result: Omit<TestResult, "receipt">,
  runId: string,
  password: string,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({
      ...result,
      run_id: runId,
      expires: now + 8 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", password).update(body).digest("hex")}`;
}
export function verifyResult(
  receipt: string,
  runId: string,
  password: string,
  now = Date.now(),
): TestResult {
  const [body, signature, extra] = receipt.split(".");
  if (!body || !/^[0-9a-f]{64}$/.test(signature || "") || extra)
    throw new Error("Invalid result receipt.");
  const expected = createHmac("sha256", password).update(body).digest("hex");
  if (
    !timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    )
  )
    throw new Error("Invalid result receipt.");
  const value = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as Receipt;
  if (value.run_id !== runId || value.expires <= now)
    throw new Error(
      "Results expired or belong to another run. Run the tests again.",
    );
  aiSchema.parse(value.ai);
  const { run_id: _run, expires: _expiry, ...result } = value;
  return { ...result, receipt };
}
export function parseRun(
  value: unknown,
  seeds: SeedTicket[],
  password: string,
) {
  const body = value as {
    run_id?: unknown;
    receipts?: unknown;
    reviews?: unknown;
  };
  if (
    !body ||
    !validRunId(body.run_id) ||
    !Array.isArray(body.receipts) ||
    body.receipts.length > 16
  )
    throw new Error("Invalid test run.");
  const results = body.receipts.map((r) => {
    if (typeof r !== "string" || r.length > 25000)
      throw new Error("Invalid result receipt.");
    return verifyResult(r, body.run_id as string, password);
  });
  if (
    new Set(results.map((r) => r.ticket_id)).size !== results.length ||
    results.some((r) => !seeds.some((s) => s.ticket_id === r.ticket_id))
  )
    throw new Error("Duplicate or unknown tickets in the run.");
  const reviews: Record<string, boolean> = {};
  if (
    body.reviews &&
    typeof body.reviews === "object" &&
    !Array.isArray(body.reviews)
  ) {
    for (const [id, review] of Object.entries(body.reviews)) {
      if (
        typeof review !== "boolean" ||
        !results.some((r) => r.ticket_id === id && r.ai.draft_reply)
      )
        throw new Error("Invalid draft review.");
      reviews[id] = review;
    }
  }
  return { run_id: body.run_id, results, reviews };
}
export async function saveRun(
  client: AirtableClient,
  seeds: SeedTicket[],
  results: TestResult[],
  reviews: Record<string, boolean>,
  runId: string,
) {
  const summary = testSummary(seeds, results, reviews);
  const notes = JSON.stringify({
    run_id: runId,
    summary,
    tickets: seeds.map((s) => {
      const r = results.find((r) => r.ticket_id === s.ticket_id);
      return {
        ticket: s.ticket_id,
        expected_route: s.expected_route,
        actual_route: r?.ai.route || null,
        draft: !!r?.ai.draft_reply,
        confidence: r?.ai.confidence || null,
        checks: automaticChecks(s, r),
        accuracy: !r?.ai.draft_reply
          ? "not applicable"
          : reviews[s.ticket_id] === true
            ? "✓"
            : reviews[s.ticket_id] === false
              ? "✗"
              : "unreviewed",
        ai_result_record: r?.record_id || null,
        model: r?.model || null,
        warnings: r?.warnings || [],
      };
    }),
  });
  // Test Runs.id is autonumber: omit it so Airtable assigns it.
  const rows = await client.write("Test Runs", [
    {
      fields: {
        run_at: new Date().toISOString(),
        passed: summary.passed,
        failed: summary.failed,
        notes,
      },
    },
  ]);
  if (!rows[0]?.id)
    throw new Error("Airtable did not confirm the Test Runs row.");
  return rows[0].id;
}
export async function publishRun(
  client: AirtableClient,
  seeds: SeedTicket[],
  results: TestResult[],
) {
  if (
    results.length !== seeds.length ||
    seeds.some((s) => !results.some((r) => r.ticket_id === s.ticket_id))
  )
    throw new Error(
      "Run all 16 tickets successfully before using the results for the demo.",
    );
  const previous = (
    await client.list("AI Results", { filterByFormula: demoResultsFormula })
  ).filter(isDemoResult);
  const create: { fields: Record<string, unknown> }[] = [],
    update: { id: string; fields: Record<string, unknown> }[] = [];
  const remove: string[] = [];
  const publishedAt = new Date().toISOString();
  for (const result of results) {
    const matches = previous.filter((r) =>
      (r.fields.ticket as string[] | undefined)?.includes(
        result.ticket_record_id,
      ),
    );
    const outcome: TriageOutcome = { ...result, run_at: publishedAt };
    const fields = resultFields(
      outcome,
      result.ticket_record_id,
      `demo:${result.model}`,
    );
    if (matches[0]) update.push({ id: matches[0].id, fields });
    else create.push({ fields });
    remove.push(...matches.slice(1).map((r) => r.id));
  }
  await client.write("AI Results", update, "update");
  await client.write("AI Results", create);
  await client.remove("AI Results", remove);
  await client.write(
    "Tickets",
    results.map((r) => ({
      id: r.ticket_record_id,
      fields: { ...ticketState(r.ai), claimed_by: "" },
    })),
    "update",
  );
  // Historical live results, Decisions, and visitor sandboxes are preserved.
  return results.length;
}
