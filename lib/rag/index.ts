import type { StudioProject, Section } from '../../studioTypes';
import { chunkText } from './chunking';
import { sharedEmbedder } from './embedder';
import { replaceRecordsForRef, deleteRecordsForRef, search, type VectorRecord } from './vectorStore';

/** Full (re)index of a project: every section and every codex entry. Safe to call repeatedly. */
export async function indexProject(project: StudioProject): Promise<void> {
  const embed = sharedEmbedder();
  for (const chapter of project.chapters) {
    for (const section of chapter.sections) {
      await indexSection(project.id, chapter.chapterNumber, section, embed);
    }
  }
  await indexCodex(project, embed);
}

async function embedRecords(
  embed: (texts: string[]) => Promise<number[][]>,
  kind: VectorRecord['kind'],
  refId: string,
  chunks: { text: string }[],
  chapterNumber?: number,
): Promise<VectorRecord[]> {
  if (!chunks.length) return [];
  const vectors = await embed(chunks.map((c) => c.text));
  return chunks.map((c, i) => ({
    id: `${refId}#${i}`,
    kind,
    refId,
    text: c.text,
    vector: vectors[i],
    chapterNumber,
  }));
}

/** Re-index one section after a manual edit or AI rewrite. Called instead of a full project re-index. */
export async function indexSection(
  projectId: string,
  chapterNumber: number,
  section: Section,
  embed = sharedEmbedder(),
): Promise<void> {
  const chunks = chunkText(section.content);
  const records = await embedRecords(embed, 'scene', section.id, chunks, chapterNumber);
  await replaceRecordsForRef(projectId, section.id, records);
}

export async function removeSection(projectId: string, sectionId: string): Promise<void> {
  await deleteRecordsForRef(projectId, sectionId);
}

type CodexEntity =
  | { kind: 'character'; entry: StudioProject['codex']['characters'][number] }
  | { kind: 'location'; entry: StudioProject['codex']['locations'][number] }
  | { kind: 'event'; entry: StudioProject['codex']['events'][number] }
  | { kind: 'worldRule'; entry: StudioProject['codex']['worldRules'][number] };

function codexEntityText(entity: CodexEntity): string {
  switch (entity.kind) {
    case 'character': {
      const c = entity.entry;
      return [c.name, c.role, c.description, c.personality, c.goals, c.relationships].filter(Boolean).join('. ') || c.name;
    }
    case 'location': {
      const l = entity.entry;
      return [l.name, l.description, l.significance].filter(Boolean).join('. ') || l.name;
    }
    case 'event': {
      const e = entity.entry;
      return [e.title, e.summary, e.keyOutcomes].filter(Boolean).join('. ') || e.title;
    }
    case 'worldRule': {
      const w = entity.entry;
      return [w.category, w.rule, w.exceptions].filter(Boolean).join('. ') || w.rule;
    }
  }
}

/** Re-index one codex entry after it is created, edited, or its text changes. */
export async function indexCodexEntry(projectId: string, entity: CodexEntity): Promise<void> {
  const embed = sharedEmbedder();
  const text = codexEntityText(entity);
  const records = await embedRecords(embed, entity.kind, entity.entry.id, chunkText(text));
  await replaceRecordsForRef(projectId, entity.entry.id, records);
}

export async function removeCodexEntry(projectId: string, entryId: string): Promise<void> {
  await deleteRecordsForRef(projectId, entryId);
}

async function indexCodex(project: StudioProject, embed: (texts: string[]) => Promise<number[][]>): Promise<void> {
  const { characters, locations, events, worldRules } = project.codex;
  for (const entry of characters) {
    const records = await embedRecords(embed, 'character', entry.id, chunkText(codexEntityText({ kind: 'character', entry })));
    await replaceRecordsForRef(project.id, entry.id, records);
  }
  for (const entry of locations) {
    const records = await embedRecords(embed, 'location', entry.id, chunkText(codexEntityText({ kind: 'location', entry })));
    await replaceRecordsForRef(project.id, entry.id, records);
  }
  for (const entry of events) {
    const records = await embedRecords(embed, 'event', entry.id, chunkText(codexEntityText({ kind: 'event', entry })));
    await replaceRecordsForRef(project.id, entry.id, records);
  }
  for (const entry of worldRules) {
    const records = await embedRecords(embed, 'worldRule', entry.id, chunkText(codexEntityText({ kind: 'worldRule', entry })));
    await replaceRecordsForRef(project.id, entry.id, records);
  }
}

/** Top-k relevant chunks for a generation prompt: prior plot events, location details, character traits. */
export async function retrieveContext(projectId: string, query: string, k = 5): Promise<string[]> {
  if (!query.trim()) return [];
  const embed = sharedEmbedder();
  const [queryVector] = await embed([query]);
  if (!queryVector) return [];
  const hits = await search(projectId, queryVector, k);
  return hits.map((h) => `[${h.kind}${h.chapterNumber ? ` · ch.${h.chapterNumber}` : ''}] ${h.text}`);
}
