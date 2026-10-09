import "server-only";
import { AirtableClient } from "./airtable-core";
export function airtableConfigured() {
  return !!(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID);
}
export function airtable() {
  if (!airtableConfigured())
    throw new Error("Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Vercel.");
  return new AirtableClient(
    process.env.AIRTABLE_TOKEN!,
    process.env.AIRTABLE_BASE_ID!,
  );
}
