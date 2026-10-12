import { NextResponse } from "next/server";
import { airtable } from "@/lib/server/airtable";
import { getSnapshot } from "@/lib/server/snapshot";
import { logDecisions, parseBatch } from "@/lib/server/decisions";
import { sendVisitorAlerts } from "@/lib/server/slack";
import {
  publicWriteGate,
  sessionWriteGate,
  withinWriteQuota,
} from "@/lib/server/public-limits";
import { loadData } from "@/lib/load-data";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    // Next may use an internal hostname in request.url behind a reverse proxy.
    sameOrigin =
      ["http:", "https:"].includes(origin.protocol) &&
      origin.host === request.headers.get("host");
  } catch {
    /* Reject missing or malformed origins. */
  }
  if (!sameOrigin) return NextResponse.json({ logged: false }, { status: 403 });
  let batch;
  try {
    const body = await request.text();
    if (body.length > 65000) throw new Error("Too large.");
    batch = parseBatch(
      JSON.parse(body),
      loadData().tickets.map((t) => t.ticket_id),
    );
  } catch {
    return NextResponse.json({ logged: false }, { status: 400 });
  }
  const limited = () =>
    NextResponse.json(
      {
        logged: false,
        limited: true,
        message:
          "Demo limit reached. You can keep exploring; new actions stay in this tab.",
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  if (!publicWriteGate.begin()) return limited();
  const release = sessionWriteGate.begin(batch.session_id);
  if (!release) return limited();
  try {
    const snapshot = await getSnapshot();
    if (snapshot.offline) return NextResponse.json({ logged: false });
    const client = airtable();
    if (!(await withinWriteQuota(client, batch))) return limited();
    const saved = await logDecisions(client, batch, snapshot.recordIds);
    const slack = await sendVisitorAlerts(
      client,
      batch,
      saved,
      snapshot.tickets,
    );
    return NextResponse.json({ logged: true, slack });
  } catch {
    return NextResponse.json({ logged: false });
  } finally {
    release();
  }
}
