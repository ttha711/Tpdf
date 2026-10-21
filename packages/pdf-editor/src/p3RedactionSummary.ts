import type { PdfChange } from "./history.js";
export type PendingRedaction = { terms: string[]; regions: number; pages: number[] };
export function summarizeRedactions(changes: PdfChange[]): PendingRedaction {
  const terms: string[] = [];
  const pages = new Set<number>();
  let regions = 0;
  for (const change of changes) {
    if (change.kind !== "redact") continue;
    regions += change.regions.length;
    change.terms?.forEach((term) => terms.push(term));
    change.regions.forEach((region) => pages.add(region.page));
    change.pages?.forEach((page) => pages.add(page));
  }
  return { terms, regions, pages: [...pages].sort((a, b) => a - b) };
}
export function redactHistoryWarning(purgesHistory?: boolean): string {
  return purgesHistory === true
    ? "Older versions of this file will also be permanently deleted."
    : "Earlier versions may still contain the originals.";
}
