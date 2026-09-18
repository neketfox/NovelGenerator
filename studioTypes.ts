// Types for the multi-project "AI Novel Studio" layer. Kept separate from the
// existing single-run generator types in types.ts (Character, ChapterData, ...),
// which stay wired to the generation pipeline unchanged.

export type StudioLanguage = 'en' | 'ru' | 'uk';

export interface CoverHistoryEntry {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
}

export interface CharacterEntry {
  id: string;
  name: string;
  role: string;
  description: string;
  personality: string;
  goals: string;
  relationships: string;
  avatar?: string;
}

export interface LocationEntry {
  id: string;
  name: string;
  description: string;
  significance: string;
  connectedLocations: string[];
}

export interface EventEntry {
  id: string;
  timelinePosition: number;
  title: string;
  summary: string;
  keyOutcomes: string;
  affectedEntities: string[];
}

export interface WorldRuleEntry {
  id: string;
  category: string;
  rule: string;
  exceptions: string;
}

export interface Codex {
  characters: CharacterEntry[];
  locations: LocationEntry[];
  events: EventEntry[];
  worldRules: WorldRuleEntry[];
}

export function emptyCodex(): Codex {
  return { characters: [], locations: [], events: [], worldRules: [] };
}

export interface Section {
  id: string;
  order: number;
  content: string;
  aiPromptsUsed: string[];
  lastEditedAt: string;
}

export type ChapterStatus = 'draft' | 'review' | 'final';

export interface StudioChapter {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string;
  sections: Section[];
  coverImage?: string;
  coverHistory: CoverHistoryEntry[];
  status: ChapterStatus;
}

export interface StudioProject {
  id: string;
  title: string;
  synopsis: string;
  genre: string;
  coverImage?: string;
  coverHistory: CoverHistoryEntry[];
  language: StudioLanguage;
  createdAt: string;
  updatedAt: string;
  chapters: StudioChapter[];
  codex: Codex;
}

export function createEmptyProject(partial: Partial<StudioProject> = {}): StudioProject {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title ?? 'Untitled Book',
    synopsis: partial.synopsis ?? '',
    genre: partial.genre ?? '',
    coverImage: partial.coverImage,
    coverHistory: partial.coverHistory ?? [],
    language: partial.language ?? 'en',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    chapters: partial.chapters ?? [],
    codex: partial.codex ?? emptyCodex(),
  };
}

// --- API key rotation & usage tracking ---

export interface GeminiKeySlot {
  id: string;
  label: string;
  key: string;
  disabledUntil?: number;
  /** The last cooldown this key served, so a repeat offender rests longer than a first one. */
  lastCooldownMs?: number;
}

export interface UsageSample {
  timestamp: number;
  promptTokens: number;
  completionTokens: number;
  keyId?: string;
}
