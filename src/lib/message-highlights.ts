// Merge overlapping flags so a shorter AI phrase cannot hide part of a
// safety-net match. MessageText calls this only outside hidden-detail tags.
export function highlightParts(text: string, phrases: string[]) {
  const ranges = phrases
    .filter((phrase) => phrase.trim())
    .flatMap((phrase) => {
      const literal = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return [...text.matchAll(new RegExp(literal, "giu"))].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
      }));
    })
    .sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end)
      last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const parts: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const { start, end } of merged) {
    if (cursor < start)
      parts.push({ text: text.slice(cursor, start), highlighted: false });
    parts.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), highlighted: false });
  return parts;
}
