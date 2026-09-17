import { isFileBackendAvailable } from '../../services/apiAvailability';
import { cosineSimilarity } from './embedder';

export type VectorKind = 'scene' | 'character' | 'location' | 'event' | 'worldRule';

export interface VectorRecord {
  id: string;
  kind: VectorKind;
  /** id of the owning entity: a section id for 'scene', a codex entry id otherwise. */
  refId: string;
  text: string;
  vector: number[];
  chapterNumber?: number;
}

async function requireFileBackend(): Promise<void> {
  if (!(await isFileBackendAvailable())) {
    throw new Error('The project data server is not running. Start the app with `npm run dev`.');
  }
}

/**
 * Replace every vector belonging to refId (a rewritten section, or an edited codex entry) — a
 * single file write at data/<id>/rag/<refId>.json, a true point update rather than a rewrite
 * of the whole project's memory. This is a local pet project run only via `npm run dev`, so
 * there is no browser-storage fallback here.
 */
export async function replaceRecordsForRef(projectId: string, refId: string, next: VectorRecord[]): Promise<void> {
  await requireFileBackend();
  await fetch(`/api/projects/${projectId}/rag/${refId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: next }),
  });
}

export async function deleteRecordsForRef(projectId: string, refId: string): Promise<void> {
  await requireFileBackend();
  await fetch(`/api/projects/${projectId}/rag/${refId}`, { method: 'DELETE' });
}

export async function clearProjectIndex(projectId: string): Promise<void> {
  await requireFileBackend();
  await fetch(`/api/projects/${projectId}/rag`, { method: 'DELETE' });
}

async function loadAll(projectId: string): Promise<VectorRecord[]> {
  await requireFileBackend();
  const res = await fetch(`/api/projects/${projectId}/rag`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

export interface SearchHit extends VectorRecord {
  score: number;
}

export async function search(projectId: string, queryVector: number[], k = 5): Promise<SearchHit[]> {
  const all = await loadAll(projectId);
  return all
    .map((r) => ({ ...r, score: cosineSimilarity(queryVector, r.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
