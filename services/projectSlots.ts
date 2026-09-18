/**
 * Project slots on disk: data/<id>/snapshot.json, in the generator's own snapshot format
 * (utils/novel/v2/export.ts) — the same artifact the box already exports, imports and resumes
 * from. One slot per book, so the dashboard lists real books and opening one resumes the run
 * exactly where it stopped. No browser storage is involved.
 */
export interface SlotSummary {
  id: string;
  title: string;
  premise: string;
  genre: string;
  chaptersWritten: number;
  chapterCount: number;
  /** Started but not finished — the card the dashboard offers to continue. */
  unfinished: boolean;
  updatedAt: string | null;
}

/**
 * A readable directory name for a book, so data/ can be browsed by hand and the URL says
 * which book is open. Latin/digits survive; anything else (including Cyrillic) becomes a
 * separator, and a short suffix keeps two books with the same title apart.
 */
export function slugifyProjectName(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `book-${suffix}`;
}

export async function listSlots(): Promise<SlotSummary[]> {
  try {
    const res = await fetch('/api/slots');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.slots) ? data.slots : [];
  } catch {
    return [];
  }
}

export async function loadSlot(id: string): Promise<unknown | null> {
  try {
    const res = await fetch(`/api/slots/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveSlot(id: string, snapshot: unknown): Promise<void> {
  await fetch(`/api/slots/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
}

export async function deleteSlot(id: string): Promise<void> {
  await fetch(`/api/slots/${id}`, { method: 'DELETE' });
}
