"use client";
import "./globals.css";
import { RecoveryPage } from "@/components/recovery-page";
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <RecoveryPage retry={reset} />
      </body>
    </html>
  );
}
