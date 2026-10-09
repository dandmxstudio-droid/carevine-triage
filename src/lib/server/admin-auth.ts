import "server-only";
import { cookies } from "next/headers";
import { verifyAdminCookie } from "./auth-token";
export const adminCookie = "carevine-admin";
export async function isAdmin() {
  return verifyAdminCookie(
    (await cookies()).get(adminCookie)?.value,
    process.env.ADMIN_PASSWORD,
  );
}
export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Sign in again at /admin.");
}
