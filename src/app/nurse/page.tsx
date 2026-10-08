import { Suspense } from "react";
import { NurseView } from "@/components/nurse-view";
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="main">
          <p>Loading nurse queue…</p>
        </main>
      }
    >
      <NurseView />
    </Suspense>
  );
}
