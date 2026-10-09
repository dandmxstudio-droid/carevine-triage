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

// Word boundaries avoid matching unrelated substrings; flexible whitespace and
// apostrophes cover the forms members actually type. Return the original text
// so the same matches can be highlighted without reconstructing a phrase.
const crisisPatterns = [
  /\bhurt(?:ing)?\s+myself\b/gi,
  /\bkill(?:ing)?\s+myself\b/gi,
  /\bharm(?:ing)?\s+myself\b/gi,
  /\bself[\s\-‐‑–]+harm(?:ing)?\b/gi,
  /\bsuicid(?:e|al)\b/gi,
  /\bend\s+my\s+life\b/gi,
  /\bwant\s+to\s+die\b/gi,
  /\b(?:don['’]t|do\s+not)\s+want\s+to\s+live\b/gi,
  /\b(?:don['’]t|do\s+not)\s+see\s+the\s+point\b/gi,
  /\bchest\s+pain\b/gi,
  /\b(?:can['’]t|cannot|can\s+not)\s+breathe\b/gi,
  /\btrouble\s+breathing\b/gi,
  /\bstroke\b/gi,
  /\bfaint(?:ed|ing)\b/gi,
  /\bseizures?\b/gi,
];
export function crisisMatches(message: string) {
  const matches = crisisPatterns
    .flatMap((pattern) =>
      [...message.matchAll(pattern)].map((match) => ({
        text: match[0],
        at: match.index,
      })),
    )
    .sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  return matches
    .filter(({ text }) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ text }) => text);
}

export function hasPersonalDetails(text: string) {
  return /\[[^\]\n]+\]|\d{6,}/.test(text) || redact(text).removed.length > 0;
}
