import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { authorizeAdminRequest } from "@/lib/server/admin-request";
import { airtable } from "@/lib/server/airtable";
import { loadData } from "@/lib/load-data";
import { parseRun, publishRun, saveRun } from "@/lib/server/test-runs";
import { demoCacheTag } from "@/lib/server/snapshot";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!(await authorizeAdminRequest(request)))
    return NextResponse.json({ error: "Sign in at /admin." }, { status: 403 });
  const seeds = loadData().tickets;
  let action: string, run: ReturnType<typeof parseRun>;
  try {
    const text = await request.text();
    if (text.length > 400000) throw new Error("Test run is too large.");
    const body = JSON.parse(text);
    if (body.action !== "save" && body.action !== "publish")
      throw new Error("Choose save or publish.");
    action = body.action;
    run = parseRun(body, seeds, process.env.ADMIN_PASSWORD!);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid test run." },
      { status: 400 },
    );
  }
  try {
    if (action === "save") {
      const id = await saveRun(
        airtable(),
        seeds,
        run.results,
        run.reviews,
        run.run_id,
      );
      return NextResponse.json({
        message: `Test run saved to Airtable (${id}).`,
      });
    }
    const count = await publishRun(airtable(), seeds, run.results);
    revalidateTag(demoCacheTag, { expire: 0 });
    return NextResponse.json({
      message: `${count} real Triage Tool results are now the demo baseline. Reload a public page and click Reset demo, or open a fresh tab.`,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Airtable could not finish this action. A partial write may have occurred. Check Airtable and /admin before trying again.",
      },
      { status: 503 },
    );
  }
}
