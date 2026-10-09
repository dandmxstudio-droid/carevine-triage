"use client";
import { RecoveryPage } from "@/components/recovery-page";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <RecoveryPage retry={reset} />;
}
