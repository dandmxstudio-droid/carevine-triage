import { isAdmin } from "@/lib/server/admin-auth";
import { loadData } from "@/lib/load-data";
import Tests from "@/components/test-runner";
import { triageModel } from "@/lib/llm";
export default async function TestsPage() {
  if (!(await isAdmin())) return null;
  const { tickets: seeds } = loadData();
  return (
    <Tests
      seeds={seeds}
      model={triageModel()}
      configured={!!process.env.OPENAI_API_KEY}
    />
  );
}
