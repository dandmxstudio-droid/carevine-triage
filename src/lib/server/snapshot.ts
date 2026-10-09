import "server-only";
import { unstable_cache } from "next/cache";
import { airtable, airtableConfigured } from "./airtable";
import { readSnapshot, type ServerSnapshot } from "./demo-data";
import { loadData } from "../load-data";
import { createDemo } from "../demo";
export const demoCacheTag = "carevine-airtable-demo-v2";
async function loadSnapshot(): Promise<ServerSnapshot> {
  const seeds = loadData().tickets;
  try {
    if (airtableConfigured()) return await readSnapshot(airtable(), seeds);
  } catch {
    /* Missing data, auth, invalid rows, network errors and 429 all fall back. */
  }
  const loaded_at = Date.now();
  return {
    ...createDemo(seeds, loaded_at),
    loaded_at,
    offline: true,
    recordIds: {},
  };
}
export function getSnapshot() {
  return unstable_cache(
    loadSnapshot,
    [demoCacheTag, process.env.AIRTABLE_BASE_ID || "offline"],
    { revalidate: 300, tags: [demoCacheTag] },
  )();
}
