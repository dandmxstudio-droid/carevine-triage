import { isAdmin } from "@/lib/server/admin-auth";
import { loadData } from "@/lib/load-data";
import { createDemo } from "@/lib/demo";
import { DemoProvider } from "@/components/demo-provider";
import Tests from "@/components/test-runner";
export default async function TestsPage() {
  if (!(await isAdmin())) return null;
  const { tickets: seeds, articles } = loadData();
  const loaded_at = Date.now();
  return (
    <DemoProvider
      seeds={seeds}
      articles={articles}
      snapshot={{
        tickets: createDemo(seeds, loaded_at).tickets,
        loaded_at,
        offline: true,
      }}
    >
      <Tests />
    </DemoProvider>
  );
}
