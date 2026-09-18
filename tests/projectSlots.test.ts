import { describe, it, expect, vi, afterEach } from 'vitest';
import { listSlots, loadSlot, saveSlot, deleteSlot, slugifyProjectName } from '../services/projectSlots';
import { PersistentProjectStore } from '../utils/novel/v2/persistent';
import type { ProjectInput } from '../utils/novel/v2/types';

const input: ProjectInput = {
  premise: 'A courier smuggles a letter across a closed border.',
  chapter_count: 3,
  genre: 'romance',
  target_total_words: 12000,
  author_requirements: '(none)',
};

/** A fetch stub standing in for the dev server's /api/slots routes, backed by a plain map. */
function stubSlotServer(files = new Map<string, unknown>()) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const id = url.replace('/api/slots', '').replace('/', '');
    if (method === 'GET' && !id) {
      return { ok: true, json: async () => ({ slots: [...files.keys()].map(key => ({ id: key })) }) };
    }
    if (method === 'GET') {
      return files.has(id)
        ? { ok: true, json: async () => files.get(id) }
        : { ok: false, json: async () => ({}) };
    }
    if (method === 'PUT') {
      files.set(id, JSON.parse(init?.body ?? '{}'));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (method === 'DELETE') {
      files.delete(id);
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { files, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('project slots', () => {
  it('names a slot after the book, and keeps two books of the same name apart', () => {
    const first = slugifyProjectName('The Paper Princess');
    const second = slugifyProjectName('The Paper Princess');
    expect(first).toMatch(/^the-paper-princess-[a-z0-9]{5}$/);
    expect(first).not.toBe(second);
  });

  it('still produces a usable directory name for a title with no latin letters', () => {
    // Cyrillic collapses to nothing, so the slug falls back rather than becoming empty.
    expect(slugifyProjectName('Паперова принцеса')).toMatch(/^book-[a-z0-9]{5}$/);
  });

  it('reads, writes and deletes a slot through the file API', async () => {
    stubSlotServer();
    await saveSlot('my-book', { version: 1, files: { input } });
    expect(await loadSlot('my-book')).toEqual({ version: 1, files: { input } });
    expect((await listSlots()).map(s => s.id)).toContain('my-book');
    await deleteSlot('my-book');
    expect(await loadSlot('my-book')).toBeNull();
  });

  it('reports no slots rather than throwing when the dev server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await listSlots()).toEqual([]);
    expect(await loadSlot('anything')).toBeNull();
  });
});

describe('persistent store over slots', () => {
  it('writes a book into its own slot and reopens it from there', async () => {
    const { files } = stubSlotServer();
    const store = await PersistentProjectStore.open('book-one');
    store.saveInput(input);
    store.saveManuscript(1, 'The border guard did not look up.');
    await store.flush();

    expect(files.has('book-one')).toBe(true);
    const reopened = await PersistentProjectStore.open('book-one');
    expect(reopened.loadInput()?.premise).toBe(input.premise);
    expect(reopened.manuscript()).toEqual([{ chapter: 1, text: 'The border guard did not look up.' }]);
  });

  it('keeps two books apart instead of sharing one slot', async () => {
    stubSlotServer();
    const first = await PersistentProjectStore.open('first-book');
    // The input comes first for a real book, and a snapshot without one is refused on restore
    // (export.ts validates before touching a slot) — so a slot only round-trips with it.
    first.saveInput(input);
    first.saveManuscript(1, 'First.');
    await first.flush();
    const second = await PersistentProjectStore.open('second-book');
    second.saveInput({ ...input, premise: 'A different book entirely.' });
    second.saveManuscript(1, 'Second.');
    await second.flush();

    expect((await PersistentProjectStore.open('first-book')).manuscript()[0].text).toBe('First.');
    expect((await PersistentProjectStore.open('second-book')).manuscript()[0].text).toBe('Second.');
  });

  it('opens an empty store rather than failing when the slot does not exist yet', async () => {
    stubSlotServer();
    const store = await PersistentProjectStore.open('never-written');
    expect(store.loadInput()).toBeNull();
    expect(store.manuscript()).toEqual([]);
  });

  it('clears the slot on disk when the book is discarded', async () => {
    const { files } = stubSlotServer();
    const store = await PersistentProjectStore.open('doomed');
    store.saveManuscript(1, 'Gone soon.');
    await store.flush();
    expect(files.has('doomed')).toBe(true);
    store.clearAll();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(files.has('doomed')).toBe(false);
  });
});
