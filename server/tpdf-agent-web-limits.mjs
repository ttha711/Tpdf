const failure = (message) => Object.assign(new Error(message), { statusCode: 413 });
export function assertOperationBudget(documents, maxBytes, maxPages = 300) {
  if (!Array.isArray(documents) || !documents.length) throw failure("No input documents.");
  let bytes = 0, pages = 0;
  for (const doc of documents) {
    if (!Number.isSafeInteger(doc.size) || doc.size < 1 ||
        !Number.isSafeInteger(doc.pages) || doc.pages < 1) throw failure("Invalid document budget.");
    bytes += doc.size;
    pages += doc.pages;
    if (bytes > maxBytes || pages > maxPages) throw failure("PDF job exceeds combined byte/page limit.");
  }
  return { bytes, pages };
}
