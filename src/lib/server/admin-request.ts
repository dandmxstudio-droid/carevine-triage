import "server-only";
import { isAdmin } from "./admin-auth";
export async function authorizeAdminRequest(request: Request) {
  if (!(await isAdmin())) return false;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      origin.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
