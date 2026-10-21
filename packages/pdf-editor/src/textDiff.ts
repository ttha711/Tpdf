/** The smallest run of whole words that differs between two lines, so a replacement only touches what the user changed. */
export function changedWords(before: string, after: string): { search: string; replacement: string } | null {
  const a = before.trim().split(/\s+/), b = after.trim().split(/\s+/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  if (start === endA && start === endB) return null;
  let from = start, toA = endA, toB = endB;
  if (from === toA) { // a pure insertion: anchor it on the neighbouring word
    if (from > 0) from--; else if (toA < a.length) { toA++; toB++; } else return null;
  }
  return { search: a.slice(from, toA).join(" "), replacement: b.slice(from, toB).join(" ") };
}
