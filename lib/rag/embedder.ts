/**
 * Sentence embeddings for the Studio RAG memory, built on the local-model worker the
 * repetition/reranker checks already use (utils/novel/modelProgress.ts) rather than a
 * second copy of the transformers.js wiring. Same model the rest of the pipeline
 * documents as the browser standard for feature-extraction: Xenova/all-MiniLM-L6-v2
 * (384 dims). Runs entirely on-device — no network call, no API key.
 */
import { localModelWorker } from '../../utils/novel/modelProgress';
import { meanPool, normalize } from '../../utils/novel/localEmbedder';

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';

export type Embed = (texts: string[]) => Promise<number[][]>;

let inProcess: Promise<Embed> | undefined;

async function loadInProcess(): Promise<Embed> {
  const { AutoTokenizer, AutoModel } = await import('@huggingface/transformers');
  const [tokenizer, encoder] = await Promise.all([
    AutoTokenizer.from_pretrained(EMBED_MODEL),
    AutoModel.from_pretrained(EMBED_MODEL, { dtype: 'q8' }),
  ]);
  return async (texts: string[]) => {
    if (!texts.length) return [];
    const batch = tokenizer(texts, { padding: true, truncation: true }) as never as {
      attention_mask: { tolist(): number[][] };
    };
    const output = (await encoder(batch as never)) as never as { last_hidden_state: { tolist(): number[][][] } };
    const hidden = output.last_hidden_state.tolist();
    return meanPool(hidden, batch.attention_mask.tolist()).map(normalize);
  };
}

/** One embedder for the whole app; the worker (or in-process fallback) loads the model once. */
export function sharedEmbedder(): Embed {
  const worker = localModelWorker();
  if (worker) {
    return async (texts: string[]) => (texts.length ? worker.embed(EMBED_MODEL, texts) : []);
  }
  inProcess ||= loadInProcess();
  return async (texts: string[]) => {
    if (!texts.length) return [];
    const embed = await inProcess!;
    return embed(texts);
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are already unit-normalized, so the dot product is the cosine.
}
