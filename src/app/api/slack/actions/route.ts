import { verifySlackRequest } from "@/lib/server/slack-signature";

// Acknowledge only authenticated Slack callbacks. Never process actions,
// invoke response_url, change tickets, or call Airtable/the Triage Tool.
export const runtime = "edge";
export async function POST(request: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret?.trim()) return new Response(null, { status: 503 });
  if (!(await verifySlackRequest(request, secret)))
    return new Response(null, { status: 401 });
  return new Response(null, { status: 200 });
}
