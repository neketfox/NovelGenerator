/** Word-based approximation of the 250-500 token chunk target (~0.75 words/token), with overlap. */
export interface Chunk {
  text: string;
  index: number;
}

export function chunkText(text: string, targetTokens = 350, overlapTokens = 60): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const size = Math.max(50, Math.round(targetTokens * 0.75));
  const overlap = Math.max(0, Math.round(overlapTokens * 0.75));
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < words.length) {
    const end = Math.min(words.length, start + size);
    chunks.push({ text: words.slice(start, end).join(' '), index: index++ });
    if (end >= words.length) break;
    start = end - overlap;
  }
  return chunks;
}
