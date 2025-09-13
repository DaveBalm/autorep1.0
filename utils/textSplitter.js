// utils/textSplitter.js
export function splitIntoChunks(text, maxChars = 1200, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    const chunk = text.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    i = end - overlap;
    if (i < 0) i = 0;
    if (i >= text.length) break;
  }
  return chunks;
}
