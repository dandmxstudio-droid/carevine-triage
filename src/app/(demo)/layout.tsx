import { DemoProvider } from "@/components/demo-provider";
import { loadData } from "@/lib/load-data";
import { getSnapshot } from "@/lib/server/snapshot";
export const dynamic = "force-dynamic";
export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tickets: seeds, articles } = loadData();
  const { tickets, loaded_at, offline } = await getSnapshot();
  return (
    <DemoProvider
      seeds={seeds}
      articles={articles}
      snapshot={{ tickets, loaded_at, offline }}
    >
      {children}
    </DemoProvider>
  );
}
