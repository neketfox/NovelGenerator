import type { ChapterData } from '../types';
import { createEmptyProject, type StudioProject, type StudioLanguage } from '../studioTypes';

/**
 * Bridges a finished single-run generation (hooks/useBookGenerator.ts) into the multi-project
 * Studio store. Each chapter's full text becomes one section; the writer can split it into
 * scenes afterwards from the Studio editor.
 */
export function chaptersToStudioProject(
  title: string,
  synopsis: string,
  genre: string,
  language: StudioLanguage,
  chapters: ChapterData[],
): StudioProject {
  return createEmptyProject({
    title: title || 'Untitled Book',
    synopsis,
    genre,
    language,
    chapters: chapters.map((chapter, index) => ({
      id: crypto.randomUUID(),
      chapterNumber: index + 1,
      title: chapter.title || `Chapter ${index + 1}`,
      summary: chapter.summary ?? '',
      status: 'final' as const,
      coverHistory: [],
      sections: [
        {
          id: crypto.randomUUID(),
          order: 0,
          content: chapter.content,
          aiPromptsUsed: [],
          lastEditedAt: new Date().toISOString(),
        },
      ],
    })),
  });
}
