"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { adminCookie, requireAdmin } from "@/lib/server/admin-auth";
import { passwordsMatch, signAdminCookie } from "@/lib/server/auth-token";
import { airtable } from "@/lib/server/airtable";
import { ensureSchema, type SchemaReport } from "@/lib/server/schema";
import { seedDemo } from "@/lib/server/demo-data";
import { loadData } from "@/lib/load-data";
import { demoCacheTag } from "@/lib/server/snapshot";
export type AdminResult = {
  message: string;
  report?: SchemaReport;
  seed?: Awaited<ReturnType<typeof seedDemo>>;
  error?: boolean;
};
export async function login(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected)
    return { error: "ADMIN_PASSWORD is not configured in Vercel." };
  const password = form.get("password");
  if (
    typeof password !== "string" ||
    password.length > 1024 ||
    !passwordsMatch(password, expected)
  )
    return { error: "Incorrect password." };
  (await cookies()).set(adminCookie, signAdminCookie(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
export async function logout() {
  (await cookies()).delete(adminCookie);
  redirect("/admin");
}
export async function setup(
  _previous: AdminResult,
  form: FormData,
): Promise<AdminResult> {
  try {
    await requireAdmin();
    const task = form.get("task");
    if (task !== "schema" && task !== "seed")
      return { message: "Choose a setup action.", error: true };
    const client = airtable();
    const report = await ensureSchema(client);
    if (!report.ready)
      return {
        message:
          "Schema needs attention. Create missing fields or resolve the listed errors, then check again. Type differences do not block seeding.",
        report,
        error: true,
      };
    if (task === "schema")
      return { message: "Connected. Schema is ready to seed.", report };
    const seed = await seedDemo(client, loadData().tickets);
    updateTag(demoCacheTag);
    return {
      message: "Demo data seeded. The shared demo cache was cleared.",
      report,
      seed,
    };
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Setup failed. Try again after checking Airtable.",
      error: true,
    };
  }
}
