import type { ProjectStore } from '../../utils/novel/v2/store';
import { codexEntries, readCodex } from '../../utils/novel/v2/codex';
import { chunkText } from './chunking';
import { sharedEmbedder } from './embedder';
import { localModelWorker } from '../../utils/novel/modelProgress';
import { replaceRecordsForRef, search, type VectorRecord } from './vectorStore';

/**
 * The embedder weighs about 90MB and is fetched on first use. Where there is no local-model
 * worker there is also nobody to consent to that download — a terminal run, a test — so the
 * index stays untouched there rather than reaching for the network behind someone's back.
 * This is the same rule the semantic gate already follows.
 */
function embeddingAvailable(): boolean {
  return localModelWorker() !== undefined;
}

/**
 * The semantic index over the book's own memory: the accepted prose, and the codex derived
 * from the design and StoryState (utils/novel/v2/codex.ts). There is no second set of
 * documents — what the pipeline wrote and what the author edited are the same records.
 *
 * Indexing is best-effort by design. The embedder is a local model that may not be present
 * (a terminal run, a test, a first visit before the weights download), and a book must never
 * fail to be written because its memory could not be vectorised: every entry point here
 * swallows its own failure and leaves retrieval returning nothing.
 */

function sceneRecordsOf(store: ProjectStore): { ref: string; chapter: number; text: string }[] {
  const design = store.loadDesign();
  const chapters = design?.chapter_map.length ?? 0;
  const records: { ref: string; chapter: number; text: string }[] = [];
  for (let chapter = 1; chapter <= chapters; chapter++) {
    for (const scene of store.chapterScenes(chapter)) {
      if (scene.prose?.trim()) records.push({ ref: scene.id, chapter, text: scene.prose });
    }
  }
  return records;
}

async function embedInto(
  projectId: string,
  ref: string,
  kind: VectorRecord['kind'],
  text: string,
  chapterNumber: number | undefined,
  embed: (texts: string[]) => Promise<number[][]>,
): Promise<void> {
  const chunks = chunkText(text);
  if (!chunks.length) return;
  const vectors = await embed(chunks.map(chunk => chunk.text));
  await replaceRecordsForRef(projectId, ref, chunks.map((chunk, index) => ({
    id: `${ref}#${index}`,
    kind,
    refId: ref,
    text: chunk.text,
    vector: vectors[index],
    chapterNumber,
  })));
}

const CODEX_KINDS: Record<string, VectorRecord['kind']> = {
  character: 'character',
  worldRule: 'worldRule',
  event: 'event',
  fact: 'event',
  location: 'location',
};

/** Re-index one scene's prose — called when a scene is accepted, not on a timer. */
export async function indexScene(projectId: string, sceneId: string, chapter: number, prose: string): Promise<void> {
  if (!embeddingAvailable()) return;
  try {
    await embedInto(projectId, sceneId, 'scene', prose, chapter, sharedEmbedder());
  } catch {
    // Memory stays searchable by what is already indexed; the next pass retries this scene.
  }
}

/** Re-index the codex after an edit, so a corrected character is what retrieval returns. */
export async function indexCodex(projectId: string, store: ProjectStore): Promise<void> {
  if (!embeddingAvailable()) return;
  try {
    const embed = sharedEmbedder();
    for (const entry of codexEntries(readCodex(store))) {
      await embedInto(projectId, entry.ref, CODEX_KINDS[entry.kind] ?? 'event', entry.text, undefined, embed);
    }
  } catch {
    // As above: an unavailable embedder degrades retrieval, it never stops the book.
  }
}

/** Everything at once — on opening a book, so a slot written elsewhere becomes searchable. */
export async function indexStore(projectId: string, store: ProjectStore): Promise<void> {
  if (!embeddingAvailable()) return;
  try {
    const embed = sharedEmbedder();
    for (const scene of sceneRecordsOf(store)) {
      await embedInto(projectId, scene.ref, 'scene', scene.text, scene.chapter, embed);
    }
  } catch {
    // ignored, as above
  }
  await indexCodex(projectId, store);
}

/**
 * The memory most related to what is about to be written, as lines the writer can read.
 * Returns nothing rather than throwing when the embedder or the index is unavailable — the
 * caller treats it as "no extra memory", which is exactly what it is.
 */
export async function retrieveMemory(projectId: string, query: string, k = 5): Promise<string[]> {
  if (!query.trim() || !embeddingAvailable()) return [];
  try {
    const [queryVector] = await sharedEmbedder()([query]);
    if (!queryVector) return [];
    const hits = await search(projectId, queryVector, k);
    return hits.map(hit => `[${hit.kind}${hit.chapterNumber ? ` ch.${hit.chapterNumber}` : ''} ${hit.refId}] ${hit.text}`);
  } catch {
    return [];
  }
}
