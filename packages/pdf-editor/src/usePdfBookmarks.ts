import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
export type PdfBookmark = { title: string; page: number };
export function usePdfBookmarks(pdf: PDFDocumentProxy | null,
  host?: () => Promise<PdfBookmark[]>) {
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);
  useEffect(() => {
    let alive = true;
    setBookmarks([]);
    async function load() {
      if (host) return host();
      if (!pdf) return [];
      const outline = await pdf.getOutline();
      if (!outline) return [];
      const result: PdfBookmark[] = [];
      async function walk(items: typeof outline, depth: number) {
        if (depth > 8) return;
        for (const item of items) {
          try {
            let target = item.dest;
            if (typeof target === "string") target = await pdf!.getDestination(target);
            if (Array.isArray(target) && target[0]) {
              const index = await pdf!.getPageIndex(target[0]);
              result.push({ title: item.title, page: index + 1 });
            }
          } catch { /* skip unresolved outline entries */ }
          if (item.items?.length) await walk(item.items, depth + 1);
          if (result.length >= 500) return;
        }
      }
      await walk(outline, 0);
      return result.slice(0, 500);
    }
    void load().then(result => { if (alive) setBookmarks(result.filter(item =>
      Number.isInteger(item.page) && item.page > 0 && !!item.title)); })
      .catch(() => { if (alive) setBookmarks([]); });
    return () => { alive = false; };
  }, [pdf, host]);
  return bookmarks;
}
