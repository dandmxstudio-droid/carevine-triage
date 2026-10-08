import fs from "node:fs";
import path from "node:path";
import type { Article, SeedTicket } from "./types";
// CSV parser handles quoted commas, CRLF, and escaped double quotes.
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  return rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
  );
}
export function parseArticles(text: string): Article[] {
  return [
    ...text.matchAll(
      /^## (KB-\d{3}): (.+)\r?\n([\s\S]*?)(?=^## KB-|$(?![\s\S]))/gm,
    ),
  ].map((m) => ({
    id: m[1],
    title: m[2],
    body: m[3].replace(/\n---\s*$/, "").trim(),
  }));
}
export function loadData() {
  const read = (name: string) =>
    fs.readFileSync(path.join(process.cwd(), "data", name), "utf8");
  const tickets = parseCSV(read("carevine_triage_demo_tickets.csv")).map(
    (r) => ({ ...r, demo_wait_min: Number(r.demo_wait_min) }),
  ) as SeedTicket[];
  const articles = parseArticles(read("carevine_help_center.md"));
  return { tickets, articles };
}
