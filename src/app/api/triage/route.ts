import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/server/admin-request";
import { getSnapshot } from "@/lib/server/snapshot";
import { airtable } from "@/lib/server/airtable";
import { triageTicket, recordTriage } from "@/lib/server/triage";
import { sendSlackAlert, urgentAlert } from "@/lib/server/slack";
import { signResult, validRunId } from "@/lib/server/test-runs";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!(await authorizeAdminRequest(request)))
    return NextResponse.json({ error: "Sign in at /admin." }, { status: 403 });
  let ticketId: string, runId: string;
  try {
    const text = await request.text();
    if (text.length > 2000) throw new Error();
    const body = JSON.parse(text);
    if (typeof body.ticket_id !== "string" || !validRunId(body.run_id))
      throw new Error();
    ticketId = body.ticket_id;
    runId = body.run_id;
  } catch {
    return NextResponse.json(
      { error: "Invalid ticket request." },
      { status: 400 },
    );
  }
  try {
    const snapshot = await getSnapshot();
    if (snapshot.offline)
      return NextResponse.json(
        {
          error:
            "Airtable is offline or not seeded. Check /admin before running tests.",
        },
        { status: 503 },
      );
    const ticket = snapshot.tickets.find((t) => t.ticket_id === ticketId);
    if (!ticket)
      return NextResponse.json({ error: "Unknown ticket." }, { status: 404 });
    const receivedAt = Date.now();
    const outcome = await triageTicket(ticket);
    const recordId = await recordTriage(
      airtable(),
      outcome,
      snapshot.recordIds[ticketId],
    );
    if (urgentAlert(outcome.ai)) {
      const status = await sendSlackAlert({
        ticket,
        result: outcome.ai,
        receivedAt,
      });
      if (status !== "sent")
        outcome.warnings.push(
          "Slack alert could not be delivered; the triage result was saved.",
        );
    }
    const result = {
      ...outcome,
      ticket_id: ticketId,
      ticket_record_id: snapshot.recordIds[ticketId],
      record_id: recordId,
    };
    return NextResponse.json({
      ...result,
      receipt: signResult(result, runId, process.env.ADMIN_PASSWORD!),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The test could not be saved to Airtable. No automatic retry was made. Check the connection in /admin.",
      },
      { status: 503 },
    );
  }
}
