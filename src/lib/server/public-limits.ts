import "server-only";
import type { AirtableClient } from "./airtable-core";
import type { LogBatch } from "./decisions";

export const publicWriteLimits = {
  decisions: 100,
  gaps: 10,
  requests: 30,
  windowMs: 60000,
};
// Cheap burst/concurrency protection before Airtable. Durable per-tab totals
// below survive worker restarts; this burst counter is per server instance.
export class SessionWriteGate {
  private sessions = new Map<
    string,
    { started: number; requests: number; active: boolean }
  >();
  begin(id: string, now = Date.now()): (() => void) | null {
    let session = this.sessions.get(id);
    if (session?.active) return null;
    if (!session || now - session.started >= publicWriteLimits.windowMs) {
      for (const [key, value] of this.sessions)
        if (!value.active && now - value.started >= publicWriteLimits.windowMs)
          this.sessions.delete(key);
      if (this.sessions.size >= 5000) return null;
      session = { started: now, requests: 0, active: false };
      this.sessions.set(id, session);
    }
    if (session.requests >= publicWriteLimits.requests) return null;
    session.requests++;
    session.active = true;
    return () => {
      session.active = false;
    };
  }
}
export const sessionWriteGate = new SessionWriteGate();
export async function withinWriteQuota(
  client: AirtableClient,
  batch: LogBatch,
) {
  // parseBatch has already restricted session_id to a UUID; no formula input
  // can be supplied through notes or other untrusted text.
  const filterByFormula = `{session_id}='${batch.session_id}'`;
  const decisions = await client.list("Decisions", {
    filterByFormula,
    maxRecords: String(publicWriteLimits.decisions + 1),
  });
  if (decisions.length + batch.events.length > publicWriteLimits.decisions)
    return false;
  const gaps = batch.events.filter(
    (event) => event.action === "gap_flagged" && event.gap,
  ).length;
  if (gaps) {
    const existing = await client.list("KB Gaps", {
      filterByFormula,
      maxRecords: String(publicWriteLimits.gaps + 1),
    });
    if (existing.length + gaps > publicWriteLimits.gaps) return false;
  }
  return true;
}
