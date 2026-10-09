export function redact(message: string, firstName?: string) {
  let text = message;
  const removed = new Set<string>();
  const replace = (pattern: RegExp, tag: string) => {
    text = text.replace(pattern, () => {
      removed.add(tag);
      return `[${tag}]`;
    });
  };
  // Dates first: a numeric date must not be mistaken for a phone number.
  text = text.replace(
    /\b(DOB|date of birth|born)(\s*(?:is|on|:)?\s*)((?:\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4})|(?:[A-Za-z]+\s+\d{1,2},?\s+\d{4}))/gi,
    (_, label, gap) => {
      removed.add("DOB");
      return `${label}${gap}[DOB]`;
    },
  );
  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "EMAIL");
  replace(/\bM-\d+\b/gi, "MEMBER ID");
  text = text.replace(
    /\b((?:member|membership|ID)\s*(?:number|id|#)?\s*(?:is|:|=)?\s*)([A-Z]*-?\d{3,})\b/gi,
    (_, label) => {
      removed.add("MEMBER ID");
      return `${label}[MEMBER ID]`;
    },
  );
  replace(
    /(?<!\w)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\w)/g,
    "PHONE",
  );
  replace(
    /\b\d{1,6}\s+(?:[A-Za-z0-9]+[ .-]+){1,6}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|way|place|pl)\b\.?\s*(?:(?:apt|unit|suite|#)\s*[\w-]+)?/gi,
    "ADDRESS",
  );
  if (firstName)
    replace(
      new RegExp(
        `\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "gi",
      ),
      "NAME",
    );
  return { text, removed: [...removed] };
}

export const crisisWords = [
  "hurt myself",
  "kill myself",
  "suicide",
  "end my life",
  "don't see the point",
  "chest pain",
  "can't breathe",
  "trouble breathing",
  "stroke",
  "fainted",
  "seizure",
];
export function crisisMatches(message: string) {
  const normalized = message.toLowerCase().replaceAll("’", "'");
  return crisisWords.filter((phrase) => normalized.includes(phrase));
}

export function hasPersonalDetails(text: string) {
  return /\[[^\]\n]+\]|\d{6,}/.test(text) || redact(text).removed.length > 0;
}
