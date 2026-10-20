export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrLine = {
  text: string;
  bbox: OcrWord["bbox"];
};

export function collectLines(data: any): OcrLine[] {
  if (Array.isArray(data?.lines) && data.lines.length) {
    return data.lines.flatMap((line: any) => {
      const words: OcrWord[] = (line?.words ?? []).filter((word: OcrWord) => {
        const confidence = Number(word?.confidence ?? (word as any)?.conf ?? 0);
        return String(word?.text ?? "").trim() && !(confidence > 0 && confidence < 45);
      });
      const text = words.length
        ? words.map((word) => String(word.text).trim()).join(" ")
        : String(line?.text ?? "").trim();
      const bounds = words.length ? words.map((word) => word.bbox) : [line?.bbox];
      const validBounds = bounds.filter((bbox): bbox is OcrWord["bbox"] => Boolean(bbox));
      if (!text || !validBounds.length) return [];
      return [{
        text,
        bbox: {
          x0: Math.min(...validBounds.map((bbox) => Number(bbox.x0))),
          y0: Math.min(...validBounds.map((bbox) => Number(bbox.y0))),
          x1: Math.max(...validBounds.map((bbox) => Number(bbox.x1))),
          y1: Math.max(...validBounds.map((bbox) => Number(bbox.y1))),
        },
      }];
    });
  }

  const lines: any[] = [];
  for (const block of data?.blocks ?? []) {
    for (const paragraph of block?.paragraphs ?? []) {
      lines.push(...(paragraph?.lines ?? []));
    }
  }
  if (lines.length) return collectLines({ lines });

  const words: OcrWord[] = Array.isArray(data?.words) ? data.words : [];
  return words.flatMap((word) => {
    const confidence = Number(word?.confidence ?? (word as any)?.conf ?? 0);
    const text = String(word?.text ?? "").trim();
    return text && !(confidence > 0 && confidence < 45) && word?.bbox
      ? [{ text, bbox: word.bbox }]
      : [];
  });
}

