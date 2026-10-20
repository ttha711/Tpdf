export function normalizeVietnamese(input) {
  return String(input).toLowerCase().replace(/đ/g, "d")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function tokenize(text) {
  return normalizeVietnamese(text).match(/[\p{L}\p{N}]+/gu) || [];
}

export function rankPages(pages, query, limit = 50) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || terms.length > 30) throw Object.assign(new Error("Invalid search query."), { statusCode: 400 });
  const docs = pages.map((item) => {
    const words = tokenize(item.text);
    const freq = new Map();
    for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);
    return { ...item, words, freq };
  });
  const n = docs.length;
  const avgLength = docs.reduce((sum, doc) => sum + doc.words.length, 0) / Math.max(1, n);
  const df = new Map(terms.map((term) => [term, docs.filter((doc) => doc.freq.has(term)).length]));
  const ranked = docs.map((doc) => {
    let score = 0;
    for (const term of terms) {
      const tf = doc.freq.get(term) || 0;
      if (!tf) continue;
      const idf = Math.log(1 + (n - df.get(term) + 0.5) / (df.get(term) + 0.5));
      score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * doc.words.length / Math.max(1, avgLength)));
    }
    if (score === 0) return null;
    const raw = String(doc.text).replace(/\s+/g, " ");
    const normalized = normalizeVietnamese(raw);
    const matches = terms.map((term) => normalized.indexOf(term)).filter((position) => position >= 0);
    const at = Math.min(...matches);
    return { page: doc.page, snippet: raw.slice(Math.max(0, at - 100), at + 180), score: Number(score.toFixed(5)) };
  }).filter(Boolean);
  return ranked.sort((a, b) => b.score - a.score || a.page - b.page).slice(0, limit);
}
