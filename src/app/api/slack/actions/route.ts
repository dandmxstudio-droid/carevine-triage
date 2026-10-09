// Acknowledge Slack's URL-button callback only. Never process the payload,
// invoke its response_url, change tickets, or call Airtable/the Triage Tool.
export async function POST() {
  return new Response(null, { status: 200 });
}
