export function usefulOcrText(value) {
  // PDFium extractText may return a metadata object, not a string.
  // Never interpret "[object Object]" as searchable native content.
  return typeof value === "string" && /[\p{L}\p{N}]/u.test(value);
}

export function assertSearchableOcr(sourcePages, resultPages) {
  if (!Array.isArray(sourcePages) || !Array.isArray(resultPages) ||
      sourcePages.length !== resultPages.length) {
    throw new Error("OCR verification failed: output page count changed.");
  }
  let recognized = 0;
  for (let i = 0; i < sourcePages.length; i++) {
    const before = usefulOcrText(sourcePages[i]);
    const after = usefulOcrText(resultPages[i]);
    if (!before && !after) {
      throw new Error(`OCR verification failed: page ${i + 1} has no extractable text.`);
    }
    if (!before && after) recognized++;
  }
  return { recognizedPages: recognized, pageCount: sourcePages.length };
}
