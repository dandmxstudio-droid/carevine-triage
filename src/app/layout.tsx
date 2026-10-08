import type { Metadata } from "next";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/nunito/800.css";
import "./globals.css";
import { loadData } from "@/lib/load-data";
import { DemoProvider } from "@/components/demo-provider";
export const metadata: Metadata = {
  title: "Carevine · Triage Tool",
  description: "Concept project. All data is synthetic.",
  icons: { icon: "/brand/carevine-app-icon.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  const { tickets, articles } = loadData();
  return (
    <html lang="en">
      <body>
        <DemoProvider seeds={tickets} articles={articles}>
          {children}
        </DemoProvider>
      </body>
    </html>
  );
}
