/**
 * Multi-project persistence for the Studio layer. This is a local pet project run only via
 * `npm run dev`, so data/<id>/ on disk (services/projectDataServer.ts) is the only place this
 * lives — no localStorage fallback. A project's metadata and its manuscript are saved
 * separately so an edit to one chapter never rewrites the whole book: saveProjectMeta() writes
 * title/codex/covers, saveChapterManuscript() writes one chapter's sections.
 */
import type { StudioProject, StudioChapter } from '../studioTypes';
import { isFileBackendAvailable } from './apiAvailability';

async function requireFileBackend(): Promise<void> {
  if (!(await isFileBackendAvailable())) {
    throw new Error('The project data server is not running. Start the app with `npm run dev`.');
  }
}

export async function listProjects(): Promise<StudioProject[]> {
  await requireFileBackend();
  const res = await fetch('/api/projects');
  const data = await res.json();
  return (data.projects as StudioProject[]) ?? [];
}

/** Full project, including every chapter's sections — used when opening it from the dashboard. */
export async function getProject(id: string): Promise<StudioProject | null> {
  await requireFileBackend();
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as StudioProject;
}

/** Title, synopsis, genre, language, cover, codex, and chapter headers — no prose. Cheap and frequent. */
export async function saveProjectMeta(project: StudioProject): Promise<void> {
  await requireFileBackend();
  const withStamp: StudioProject = { ...project, updatedAt: new Date().toISOString() };
  await fetch(`/api/projects/${withStamp.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withStamp),
  });
}

/** One chapter's sections — the fast, point-update save target for every edit and AI action. */
export async function saveChapterManuscript(projectId: string, chapter: StudioChapter): Promise<void> {
  await requireFileBackend();
  await fetch(`/api/projects/${projectId}/chapters/${chapter.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections: chapter.sections }),
  });
}

/** Metadata plus every chapter's manuscript, in one call — for first-time import of a whole book. */
export async function saveProjectFull(project: StudioProject): Promise<void> {
  await saveProjectMeta(project);
  for (const chapter of project.chapters) {
    await saveChapterManuscript(project.id, chapter);
  }
}

export async function deleteProject(id: string): Promise<void> {
  await requireFileBackend();
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
}
