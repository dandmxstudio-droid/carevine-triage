import "server-only";
import type { RecordRow } from "./airtable-core";
// Explicit publication lives in the existing model text field: no new schema calls.
export const isDemoResult = (row: RecordRow) =>
  row.fields.model === "phase-1-mock" ||
  String(row.fields.model).startsWith("demo:");
export const demoResultsFormula =
  "OR({model}='phase-1-mock',LEFT({model},5)='demo:')";
