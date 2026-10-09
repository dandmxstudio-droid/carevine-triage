import { NextResponse } from "next/server";
import { airtable } from "@/lib/server/airtable";
import { getSnapshot } from "@/lib/server/snapshot";
import { logDecisions, parseBatch } from "@/lib/server/decisions";
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
  try {
    const snapshot = await getSnapshot();
    if (snapshot.offline) return NextResponse.json({ logged: false });
    await logDecisions(airtable(), batch, snapshot.recordIds);
    return NextResponse.json({ logged: true });
  } catch {
    return NextResponse.json({ logged: false });
  }
}
