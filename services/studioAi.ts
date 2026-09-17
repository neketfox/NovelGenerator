/**
 * AI actions for the Studio editor and Codex: rewrite, expand, continuity check, and entity
 * extraction. Every call retrieves RAG context first (lib/rag) and rotates through the user's
 * Gemini key pool (services/geminiKeyPool.ts), tracking token usage as it goes. System
 * instructions are localized to the project's chosen language.
 */
import { withKeyRotation, trackUsageFromResponse, GEMINI_REQUEST_OPTIONS } from './geminiKeyPool';
import { retrieveContext } from '../lib/rag';
import type { StudioChapter, StudioProject, Section } from '../studioTypes';
import { GEMINI_MODEL_NAME } from '../constants';

const LANGUAGE_NAMES: Record<StudioProject['language'], string> = {
  en: 'English',
  ru: 'Russian',
  uk: 'Ukrainian',
};

function languageInstruction(project: StudioProject): string {
  return `Write in ${LANGUAGE_NAMES[project.language]}. Match the book's established tone and voice.`;
}

async function generate(systemInstruction: string, prompt: string): Promise<string> {
  return withKeyRotation(async (client) => {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL_NAME, systemInstruction }, GEMINI_REQUEST_OPTIONS);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    trackUsageFromResponse(response);
    const text = response.text().trim();
    if (!text) throw new Error('The model returned an empty response.');
    return text;
  });
}

/** Extracts the outermost {...} object from a model answer that may wrap JSON in prose. */
function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  return JSON.parse(slice);
}

async function contextBlock(project: StudioProject, query: string): Promise<string> {
  const chunks = await retrieveContext(project.id, query, 5);
  if (!chunks.length) return '';
  return `Relevant context from this book's memory (characters, locations, prior events):\n${chunks.join('\n')}\n`;
}

export async function rewriteSection(
  project: StudioProject,
  chapter: StudioChapter,
  section: Section,
  instruction: string,
): Promise<string> {
  const context = await contextBlock(project, section.content.slice(0, 500));
  const system = `You are a novelist's editor rewriting one section of chapter ${chapter.chapterNumber} ("${chapter.title}"). ${languageInstruction(project)} Preserve continuity with the surrounding story. Return only the rewritten prose, no commentary.`;
  const prompt = `${context}\nChapter summary: ${chapter.summary}\n\nSection to rewrite:\n"""\n${section.content}\n"""\n\nInstruction: ${instruction || 'Improve clarity and prose quality while preserving meaning.'}`;
  return generate(system, prompt);
}

export async function expandSection(
  project: StudioProject,
  chapter: StudioChapter,
  section: Section,
): Promise<string> {
  const context = await contextBlock(project, section.content.slice(-500));
  const system = `You are a novelist continuing chapter ${chapter.chapterNumber} ("${chapter.title}"). ${languageInstruction(project)} Write the next logical section, preserving established plot constraints, characters and tone. Return only the new prose.`;
  const prompt = `${context}\nChapter summary: ${chapter.summary}\n\nCurrent section (write what comes after this):\n"""\n${section.content}\n"""`;
  return generate(system, prompt);
}

export interface ContinuityReport {
  issues: string[];
  suggestion?: string;
}

export async function fixContinuity(
  project: StudioProject,
  chapter: StudioChapter,
  section: Section,
): Promise<ContinuityReport> {
  const context = await contextBlock(project, section.content.slice(0, 500));
  const system = `You are a continuity editor. ${languageInstruction(project)} Check the given section against the plot summary, active characters and locations for contradictions, plot holes, or out-of-character behavior. Respond ONLY with JSON: {"issues": string[], "suggestion": string | null}.`;
  const prompt = `${context}\nChapter summary: ${chapter.summary}\n\nSection under review:\n"""\n${section.content}\n"""`;
  const raw = await generate(system, prompt);
  try {
    const parsed = extractJsonObject(raw) as { issues?: string[]; suggestion?: string };
    return { issues: Array.isArray(parsed.issues) ? parsed.issues : [], suggestion: parsed.suggestion ?? undefined };
  } catch {
    return { issues: [raw] };
  }
}

/** Re-summarizes a chapter from its current sections, so continuity checks and future prompts see the edit. */
export async function summarizeChapter(project: StudioProject, chapter: StudioChapter): Promise<string> {
  const text = chapter.sections.map((s) => s.content).join('\n\n');
  if (!text.trim()) return chapter.summary;
  const system = `Summarize this chapter in 2-4 sentences for use as running plot memory. ${languageInstruction(project)} Return only the summary, no preamble.`;
  return generate(system, text);
}

/** Rewrites one piece of free text belonging to a codex entry (a character's description, a
 *  location's atmosphere, etc.) from a plain instruction — used by the Codex's "AI edit" action. */
export async function reviseCodexText(project: StudioProject, currentText: string, instruction: string): Promise<string> {
  const system = `You edit a novel's codex (character/location/event notes), not prose. ${languageInstruction(project)} Return only the revised text, no commentary, no quotes around it.`;
  const prompt = `Current text:\n"""\n${currentText}\n"""\n\nInstruction: ${instruction || 'Improve clarity and detail.'}`;
  return generate(system, prompt);
}

export interface CanonCheckReport {
  /** Each entry: the scene/context that conflicts, and what the conflict is. */
  conflicts: { where: string; issue: string }[];
}

/**
 * After a codex entry changes, checks whether anything already written now contradicts it —
 * retrieves the scenes most related to the entry (RAG) rather than the whole manuscript, so
 * this stays cheap regardless of book length.
 */
export async function checkCanonConsistency(project: StudioProject, entryLabel: string, updatedText: string): Promise<CanonCheckReport> {
  const context = await contextBlock(project, updatedText);
  if (!context) return { conflicts: [] }; // nothing indexed yet to check against
  const system = `You are a continuity editor checking a novel's canon. ${languageInstruction(project)} An entry in the book's codex was just changed; check the given excerpts from the manuscript for anything that now contradicts it. Respond ONLY with JSON: {"conflicts": [{"where": string, "issue": string}]}. Empty array if nothing conflicts.`;
  const prompt = `Updated codex entry (${entryLabel}):\n"""\n${updatedText}\n"""\n\n${context}`;
  const raw = await generate(system, prompt);
  try {
    const parsed = extractJsonObject(raw) as Partial<CanonCheckReport>;
    return { conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [] };
  } catch {
    return { conflicts: [{ where: '(unparsed response)', issue: raw }] };
  }
}

export interface ExtractedEntities {
  characters: { name: string; role: string; description: string }[];
  locations: { name: string; description: string }[];
  events: { title: string; summary: string }[];
}

export async function extractEntitiesFromChapter(project: StudioProject, chapter: StudioChapter): Promise<ExtractedEntities> {
  const text = chapter.sections.map((s) => s.content).join('\n\n');
  const system = `You extract story entities for a novel's codex. ${languageInstruction(project)} Respond ONLY with JSON: {"characters": [{"name": string, "role": string, "description": string}], "locations": [{"name": string, "description": string}], "events": [{"title": string, "summary": string}]}. Only include entities that are new or meaningfully developed in this chapter.`;
  const prompt = `Chapter ${chapter.chapterNumber}: ${chapter.title}\n\n${text}`;
  const raw = await generate(system, prompt);
  try {
    const parsed = extractJsonObject(raw) as Partial<ExtractedEntities>;
    return {
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return { characters: [], locations: [], events: [] };
  }
}
