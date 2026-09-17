/**
 * Shared detection for the file-backed dev API (services/projectDataServer.ts). Both
 * studioStore.ts (project metadata + manuscript) and lib/rag/vectorStore.ts (AI memory)
 * check this once and cache the result, so they agree on where data actually lives instead
 * of racing two separate probes.
 */
let cached: boolean | null = null;

export async function isFileBackendAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const res = await fetch('/api/projects', { method: 'GET' });
    cached = res.ok;
  } catch {
    cached = false;
  }
  return cached;
}
