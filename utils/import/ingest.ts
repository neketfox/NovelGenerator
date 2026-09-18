import { renderPrompt, systemContract } from '../novel/prompts';
import { structuredResponse, type NovelLLM } from '../novel/v2/llm';
import { validateBookDesign } from '../novel/v2/designer';
import type { BookDesign, ProjectInput, ProperName, StoryEvent, StoryState, WorldFact } from '../novel/v2/types';
import type { ProjectSnapshot } from '../novel/v2/export';
import { countWords, type ImportedChapter } from './docx';

/**
 * Importing a manuscript: a Word document becomes one of the generator's own project
 * slots, indistinguishable afterwards from a book started here.
 *
 * It does that by producing exactly one thing — a ProjectSnapshot — because that is
 * already the only durable artifact the box knows, the one the run resumes from. So
 * nothing downstream needs to learn what an import is: the snapshot carries the
 * recovered construction, the author's own chapters as manuscript, and the memory the
 * written chapters established, and the orchestrator continues from chapter N+1 the
 * same way it continues any interrupted run.
 */
export interface ChapterDigest {
  summary: string;
  characters: { name: string; aliases?: string[]; role_here?: string }[];
  facts: { fact: string; about?: string }[];
  opened: string[];
  closed: string[];
  inconsistencies: { problem: string; quote?: string; against?: string }[];
  pov: string;
  tense: string;
}

export interface ChapterEdit {
  text: string;
  changes: { was: string; now: string; why: string }[];
}

export interface ImportOptions {
  /** Chapters to write after the imported ones. Zero imports the book as it stands. */
  additionalChapters: number;
  language: string;
  authorRequirements: string;
  /** Run the editor over the written chapters. Off imports the prose untouched. */
  edit: boolean;
}

export type ImportStage =
  | { kind: 'reading'; chapter: number; of: number }
  | { kind: 'designing' }
  | { kind: 'editing'; chapter: number; of: number }
  | { kind: 'done' };

export interface ImportResult {
  snapshot: ProjectSnapshot;
  design: BookDesign;
  /** Every correction the editor made, for the report the dashboard shows afterwards. */
  changes: { chapter: number; was: string; now: string; why: string }[];
  /** What was found but deliberately not touched, so nothing is silently swallowed. */
  unresolved: { chapter: number; problem: string }[];
}

/** Enough of a chapter for a reading pass, without sending a whole novel in one prompt. */
export function clip(text: string, limit = 24_000): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.7));
  const tail = text.slice(-Math.floor(limit * 0.25));
  return `${head}\n\n[...]\n\n${tail}`;
}

/** What earlier chapters established, in the few lines a later reading pass can afford. */
function priorContext(digests: ChapterDigest[]): string {
  if (!digests.length) return '(this is the first chapter)';
  return digests
    .map((digest, index) => `Chapter ${index + 1}: ${digest.summary}`)
    .slice(-6)
    .join('\n');
}

export async function readChapter(chapter: ImportedChapter, prior: ChapterDigest[], llm: NovelLLM, language: string): Promise<ChapterDigest> {
  const prompt = renderPrompt('P09_IMPORT_READ', {
    chapter_number: String(chapter.number),
    chapter_title: chapter.title,
    chapter_text: clip(chapter.text),
    prior_context: priorContext(prior),
  });
  return structuredResponse<ChapterDigest>(
    prompt, systemContract(language), llm,
    ['summary', 'characters', 'facts'],
    parsed => ({
      summary: String(parsed.summary ?? ''),
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      opened: Array.isArray(parsed.opened) ? parsed.opened : [],
      closed: Array.isArray(parsed.closed) ? parsed.closed : [],
      inconsistencies: Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies : [],
      pov: String(parsed.pov ?? ''),
      tense: String(parsed.tense ?? ''),
    }),
    { temperature: 0.2, maxTokens: 8192, route: 'validator' },
  );
}

export async function recoverDesign(
  chapters: ImportedChapter[],
  digests: ChapterDigest[],
  options: ImportOptions,
  llm: NovelLLM,
): Promise<BookDesign> {
  const total = chapters.length + options.additionalChapters;
  const prompt = renderPrompt('P10_IMPORT_DESIGN', {
    written_count: String(chapters.length),
    remaining_count: String(options.additionalChapters),
    chapter_count: String(total),
    language: options.language,
    author_requirements: options.authorRequirements || '(none)',
    chapter_digests: digests
      .map((digest, index) => [
        `## Chapter ${index + 1} — ${chapters[index]?.title ?? ''} (${countWords(chapters[index]?.text ?? '')} words)`,
        `Summary: ${digest.summary}`,
        `People: ${digest.characters.map(person => person.name).join(', ') || '-'}`,
        `Established: ${digest.facts.map(item => item.fact).join('; ') || '-'}`,
        `Left standing: ${digest.opened.join('; ') || '-'}`,
        `Closed: ${digest.closed.join('; ') || '-'}`,
        `POV/tense: ${digest.pov || '-'} / ${digest.tense || '-'}`,
      ].join('\n'))
      .join('\n\n'),
  });
  const raw = await structuredResponse(
    prompt, systemContract(options.language), llm,
    ['contract', 'profile', 'dramatic_core', 'style_contract', 'characters', 'world_rules', 'causal_map', 'ending', 'chapter_map'],
    parsed => parsed,
    { temperature: 0.3, maxTokens: 16384, route: 'writer' },
  );
  const design = validateBookDesign(raw, total);
  design.language = options.language;
  return design;
}

export async function editChapter(
  chapter: ImportedChapter,
  digest: ChapterDigest,
  design: BookDesign,
  llm: NovelLLM,
  language: string,
): Promise<ChapterEdit> {
  const record = [
    `Cast: ${design.characters.map(person => person.name).join(', ')}`,
    `World rules: ${design.world_rules.map(rule => rule.rule).join('; ')}`,
    `Causal chain: ${design.causal_map.map(event => `${event.action_or_event} -> ${event.consequence}`).join('; ')}`,
  ].join('\n');
  const prompt = renderPrompt('P11_IMPORT_EDIT', {
    chapter_number: String(chapter.number),
    book_record: record,
    language,
    inconsistencies: digest.inconsistencies.length
      ? digest.inconsistencies.map(item => `- ${item.problem}${item.quote ? ` ("${item.quote}")` : ''}${item.against ? ` - against: ${item.against}` : ''}`).join('\n')
      : '(none were found when the chapter was read)',
    chapter_text: chapter.text,
  });
  return structuredResponse<ChapterEdit>(
    prompt, systemContract(language), llm,
    ['text'],
    parsed => ({
      text: typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : chapter.text,
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    }),
    { temperature: 0.2, maxTokens: 16384, route: 'validator' },
  );
}

/**
 * The memory the written chapters leave behind. Built from what the reading passes
 * recorded, not invented: a fact the manuscript never states must not appear here, or
 * the continuation would write against a book nobody wrote.
 */
export function stateFromDigests(digests: ChapterDigest[]): StoryState {
  const facts: WorldFact[] = [];
  const events: StoryEvent[] = [];
  const names = new Map<string, ProperName>();
  digests.forEach((digest, index) => {
    const chapter = index + 1;
    for (const item of digest.facts) {
      if (item?.fact) facts.push({ id: `F${facts.length + 1}`, statement: item.fact, evidence_refs: [`ch${chapter}`] });
    }
    if (digest.summary) {
      events.push({
        id: `E${events.length + 1}`,
        description: digest.summary,
        participants: digest.characters.map(person => person.name).filter(Boolean),
        evidence_refs: [`ch${chapter}`],
      });
    }
    for (const person of digest.characters) {
      if (!person?.name) continue;
      const existing = names.get(person.name);
      const aliases = Array.isArray(person.aliases) ? person.aliases.filter(Boolean) : [];
      if (existing) {
        existing.aliases = [...new Set([...existing.aliases, ...aliases])];
      } else {
        names.set(person.name, { name: person.name, kind: 'person', refers_to: '', aliases, first_seen: `ch${chapter}` });
      }
    }
  });
  return {
    facts,
    events,
    conditions: {},
    knowledge: {},
    beliefs: {},
    reader_disclosures: digests.flatMap((digest, index) => digest.opened.map(item => `ch${index + 1}: ${item}`)),
    names: [...names.values()],
  };
}

/**
 * The whole import, as one call. Chapters are read in order (each one seeing what the
 * earlier ones established), the construction is recovered from those readings, the
 * editor passes over the prose where asked, and the result is a snapshot ready to be
 * written to a slot.
 */
export async function importManuscript(
  chapters: ImportedChapter[],
  options: ImportOptions,
  llm: NovelLLM,
  onStage: (stage: ImportStage) => void = () => {},
): Promise<ImportResult> {
  if (!chapters.length) throw new Error('There are no chapters to import.');
  const digests: ChapterDigest[] = [];
  for (const chapter of chapters) {
    onStage({ kind: 'reading', chapter: chapter.number, of: chapters.length });
    digests.push(await readChapter(chapter, digests, llm, options.language));
  }

  onStage({ kind: 'designing' });
  const design = await recoverDesign(chapters, digests, options, llm);

  const changes: ImportResult['changes'] = [];
  const unresolved: ImportResult['unresolved'] = [];
  const finalText = new Map<number, string>(chapters.map(chapter => [chapter.number, chapter.text]));
  if (options.edit) {
    for (const chapter of chapters) {
      onStage({ kind: 'editing', chapter: chapter.number, of: chapters.length });
      try {
        const edit = await editChapter(chapter, digests[chapter.number - 1], design, llm, options.language);
        finalText.set(chapter.number, edit.text);
        for (const change of edit.changes) changes.push({ chapter: chapter.number, ...change });
      } catch (error) {
        // An edit that fails costs the correction, never the chapter: the author's own
        // words are kept and the problem is reported rather than quietly dropped.
        unresolved.push({ chapter: chapter.number, problem: `The editor could not pass over this chapter: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  }
  for (const [index, digest] of digests.entries()) {
    for (const item of digest.inconsistencies) {
      const fixed = changes.some(change => change.chapter === index + 1);
      if (!options.edit || !fixed) unresolved.push({ chapter: index + 1, problem: item.problem });
    }
  }

  const state = stateFromDigests(digests);
  const input: ProjectInput = {
    premise: design.dramatic_core?.distinctive_situation || design.contract?.working_title || chapters[0].title,
    chapter_count: chapters.length + options.additionalChapters,
    genre: design.contract?.genre_expectations_selected?.[0] || 'fiction',
    target_total_words: chapters.reduce((total, chapter) => total + countWords(chapter.text), 0)
      + options.additionalChapters * 2500,
    author_requirements: options.authorRequirements,
    language: options.language,
  };

  const snapshot: ProjectSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    files: {
      input,
      book_design: design,
      chapter_map: design.chapter_map,
      style_contract: design.style_contract,
      scene_plans: [],
      scenes: [],
      state,
      threads: digests.flatMap((digest, index) =>
        digest.opened.map((item, position) => ({
          id: `T${index + 1}-${position + 1}`,
          description: item,
          status: 'open' as const,
          setup_refs: [`ch${index + 1}`],
          payoff_refs: [],
        })),
      ),
      manuscript: chapters.map(chapter => ({ chapter: chapter.number, text: finalText.get(chapter.number) ?? chapter.text })),
      final_report: null,
      run_log: [
        { stage: 'import', detail: `Imported ${chapters.length} chapter(s) from a Word document; ${options.additionalChapters} still to write.` },
        ...changes.map(change => ({ stage: 'import-edit', detail: `Chapter ${change.chapter}: ${change.why}` })),
        ...unresolved.map(item => ({ stage: 'import-open', detail: `Chapter ${item.chapter}: ${item.problem}` })),
      ],
      checkpoints: ['design'],
      // The written chapters' memory, filed under the last of them, is what the
      // orchestrator loads before planning the first chapter it has to write.
      state_snapshots: { [String(chapters.length)]: state },
    },
  };

  onStage({ kind: 'done' });
  return { snapshot, design, changes, unresolved };
}
