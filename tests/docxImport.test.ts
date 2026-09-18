import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { parseDocumentXml, splitChapters, looksLikeChapterHeading, readDocxChapters, countWords } from '../utils/import/docx';
import { importManuscript, stateFromDigests, clip, type ChapterDigest } from '../utils/import/ingest';
import { restoreSnapshot } from '../utils/novel/v2/export';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import type { NovelLLM } from '../utils/novel/v2/llm';

function paragraph(text: string, style?: string): string {
  const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${props}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

const DOCUMENT = `<?xml version="1.0"?><w:document><w:body>
${paragraph('Розділ 1', 'Heading1')}
${paragraph('Вона зайшла до кімнати, і двері за нею зачинилися.')}
${paragraph('Ніхто не сказав ні слова.')}
${paragraph('Розділ 2', 'Heading1')}
${paragraph('Наступного ранку сніг уже розтанув.')}
</w:body></w:document>`;

describe('reading a Word manuscript', () => {
  it('turns paragraphs into chapters at the headings', () => {
    const chapters = splitChapters(parseDocumentXml(DOCUMENT));
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('Розділ 1');
    expect(chapters[0].text).toContain('двері за нею зачинилися');
    expect(chapters[0].text).toContain('Ніхто не сказав');
    expect(chapters[1].number).toBe(2);
  });

  it('recognises a chapter heading in the languages this author writes in', () => {
    for (const heading of ['Розділ 4', 'Глава 12', 'Chapter Seven', 'Частина II', '17.']) {
      expect(looksLikeChapterHeading({ text: heading, headingLevel: null }), heading).toBe(true);
    }
    // Prose is never a heading, however short, and neither is a long styled line.
    expect(looksLikeChapterHeading({ text: 'Вона мовчала.', headingLevel: null })).toBe(false);
  });

  it('keeps prose written before the first heading as chapter one', () => {
    const chapters = splitChapters(parseDocumentXml(
      `<w:document>${paragraph('Спочатку не було нічого.')}${paragraph('Глава 2', 'Heading1')}${paragraph('Потім був ранок.')}</w:document>`,
    ));
    expect(chapters).toHaveLength(2);
    expect(chapters[0].text).toBe('Спочатку не було нічого.');
  });

  it('makes one chapter of a document with no headings at all', () => {
    const chapters = splitChapters(parseDocumentXml(`<w:document>${paragraph('Один довгий шматок тексту.')}</w:document>`));
    expect(chapters).toHaveLength(1);
  });

  it('decodes the entities Word writes, ampersand last', () => {
    const chapters = splitChapters(parseDocumentXml(`<w:document>${paragraph('Mills &amp;amp; Boon said &amp;quot;no&amp;quot;')}</w:document>`));
    expect(chapters[0].text).toBe('Mills &amp; Boon said &quot;no&quot;');
  });

  it('reads a real .docx and refuses anything that is not one', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', DOCUMENT);
    const chapters = await readDocxChapters(await zip.generateAsync({ type: 'uint8array' }));
    expect(chapters).toHaveLength(2);

    await expect(readDocxChapters(new TextEncoder().encode('just a text file'))).rejects.toThrow(/not a \.docx/);

    const empty = new JSZip();
    empty.file('notes.txt', 'hello');
    await expect(readDocxChapters(await empty.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/word\/document\.xml/);
  });

  it('clips a long chapter from both ends, so the prompt sees the opening and the close', () => {
    const text = 'a'.repeat(5000) + 'ENDING';
    const clipped = clip(text, 1000);
    expect(clipped.length).toBeLessThan(1200);
    expect(clipped).toContain('ENDING');
  });
});

const digest = (over: Partial<ChapterDigest> = {}): ChapterDigest => ({
  summary: 'She arrives and the door locks behind her.',
  characters: [{ name: 'Olesia', aliases: ['Lesia'] }],
  facts: [{ fact: 'The house has no telephone.' }],
  opened: ['Who locked the door?'],
  closed: [],
  inconsistencies: [],
  pov: 'first',
  tense: 'past',
  ...over,
});

const DESIGN = (chapters: number) => ({
  contract: { working_title: 'The Locked House', genre_expectations_selected: ['thriller'] },
  profile: { pressure_curve: 'rising', cost_kinds: ['exposure'], mechanism_ledger: ['search'] },
  dramatic_core: { distinctive_situation: 'A woman is locked in a house that will not let her leave.' },
  style_contract: { register: 'plain' },
  characters: [{ id: 'C01', name: 'Olesia' }],
  world_rules: [{ id: 'W01', rule: 'The house has no telephone.' }],
  causal_map: [{ id: 'E01', action_or_event: 'She arrives', consequence: 'The door locks' }],
  ending: { central_resolution: 'She gets out.' },
  chapter_map: Array.from({ length: chapters }, (_, index) => ({ chapter: index + 1, function: 'x' })),
});

describe('an imported manuscript becomes an ordinary book', () => {
  const chapters = [
    { number: 1, title: 'Розділ 1', text: 'Вона зайшла до кімнати.' },
    { number: 2, title: 'Розділ 2', text: 'Наступного ранку сніг розтанув.' },
  ];

  function llmFor(edits = true, total = 4): NovelLLM {
    return vi.fn(async (prompt: string) => {
      if (prompt.includes('P09') || prompt.includes('report what it puts on the page')) return JSON.stringify(digest());
      if (prompt.includes('Recover the construction')) return JSON.stringify(DESIGN(total));
      if (prompt.includes('Correct this chapter')) {
        return edits
          ? JSON.stringify({ text: 'Вона зайшла до кімнати й зачинила двері.', changes: [{ was: 'a', now: 'b', why: 'the door was open in chapter two' }] })
          : JSON.stringify({ text: '', changes: [] });
      }
      return '{}';
    });
  }

  it('produces a snapshot the generator can resume from, with the author chapters kept', async () => {
    const result = await importManuscript(
      chapters, { additionalChapters: 2, language: 'Ukrainian', authorRequirements: '', edit: false },
      llmFor(),
    );
    const files = result.snapshot.files as Record<string, any>;
    expect(files.input.chapter_count).toBe(4);
    expect(files.input.language).toBe('Ukrainian');
    expect(files.manuscript).toEqual([
      { chapter: 1, text: 'Вона зайшла до кімнати.' },
      { chapter: 2, text: 'Наступного ранку сніг розтанув.' },
    ]);
    // The memory of the written chapters is filed under the last of them: that is the
    // snapshot the orchestrator loads before planning chapter three.
    expect(files.state_snapshots['2']).toBeTruthy();

    // The real proof: the box's own restore accepts it and the finished chapters are skipped.
    const store = new MemoryProjectStore();
    expect(() => restoreSnapshot(store, result.snapshot)).not.toThrow();
    expect(store.manuscript().map(item => item.chapter)).toEqual([1, 2]);
    expect(store.loadDesign()?.chapter_map).toHaveLength(4);
  });

  it('keeps the author words when the editor is off, and applies its corrections when it is on', async () => {
    const edited = await importManuscript(
      chapters, { additionalChapters: 0, language: 'Ukrainian', authorRequirements: '', edit: true },
      llmFor(true, 2),
    );
    const manuscript = (edited.snapshot.files as Record<string, any>).manuscript;
    expect(manuscript[0].text).toContain('зачинила двері');
    expect(edited.changes[0].why).toMatch(/door was open/);
  });

  it('falls back to the author text when the editor returns nothing', async () => {
    const result = await importManuscript(
      chapters, { additionalChapters: 0, language: 'Ukrainian', authorRequirements: '', edit: true },
      llmFor(false, 2),
    );
    const manuscript = (result.snapshot.files as Record<string, any>).manuscript;
    expect(manuscript[0].text).toBe('Вона зайшла до кімнати.');
  });

  it('reports what it found and did not fix rather than swallowing it', async () => {
    const llm: NovelLLM = vi.fn(async (prompt: string) => {
      if (prompt.includes('report what it puts on the page')) {
        return JSON.stringify(digest({ inconsistencies: [{ problem: 'Her eyes change colour between chapters.' }] }));
      }
      if (prompt.includes('Recover the construction')) return JSON.stringify(DESIGN(2));
      return '{}';
    });
    const result = await importManuscript(
      chapters, { additionalChapters: 0, language: 'Ukrainian', authorRequirements: '', edit: false }, llm,
    );
    expect(result.unresolved.map(item => item.problem)).toContain('Her eyes change colour between chapters.');
  });

  it('refuses an empty import instead of creating an empty book', async () => {
    await expect(importManuscript([], { additionalChapters: 3, language: 'English', authorRequirements: '', edit: false }, vi.fn()))
      .rejects.toThrow(/no chapters/i);
  });

  it('builds memory only out of what the chapters actually established', () => {
    const state = stateFromDigests([digest(), digest({ summary: 'She finds a key.', facts: [] })]);
    expect(state.facts).toHaveLength(1);
    expect(state.facts[0].evidence_refs).toEqual(['ch1']);
    expect(state.events).toHaveLength(2);
    // One person seen twice is one name with both its forms, not two characters.
    expect(state.names).toHaveLength(1);
    expect(state.names[0].aliases).toEqual(['Lesia']);
    expect(state.reader_disclosures).toEqual(['ch1: Who locked the door?', 'ch2: Who locked the door?']);
  });

  it('counts words the way the length estimate needs', () => {
    expect(countWords('  дві   слова  ')).toBe(2);
    expect(countWords('')).toBe(0);
  });
});
