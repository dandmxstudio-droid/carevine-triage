import { isAdmin } from "@/lib/server/admin-auth";
import { airtableConfigured } from "@/lib/server/airtable";
import { AdminSetup } from "@/components/admin-setup";
export default async function Admin() {
  if (!(await isAdmin())) return null;
  return <AdminSetup configured={airtableConfigured()} />;
}
