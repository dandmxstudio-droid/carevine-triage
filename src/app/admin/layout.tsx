import type { Metadata } from "next";
import { isAdmin } from "@/lib/server/admin-auth";
import { AdminLogin } from "@/components/admin-login";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (await isAdmin()) ? children : <AdminLogin />;
}
