import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { StudioProject, StudioChapter, Section } from '../../studioTypes';
import { getProject, saveProjectMeta, saveChapterManuscript } from '../../services/studioStore';
import { indexSection, indexProject } from '../../lib/rag';
import { rewriteSection, expandSection, fixContinuity, summarizeChapter, type ContinuityReport } from '../../services/studioAi';
import CodexManager from '../codex/CodexManager';
import CoverPanel from '../editor/CoverPanel';
import UsageWidget from '../usage/UsageWidget';
import ExportAsModal from '../common/ExportAsModal';
import SaveBeforeLeaveModal from '../common/SaveBeforeLeaveModal';
import { useI18n } from '../../i18n';

type MainTab = 'write' | 'codex' | 'covers' | 'usage';

function newSection(order: number): Section {
  return { id: crypto.randomUUID(), order, content: '', aiPromptsUsed: [], lastEditedAt: new Date().toISOString() };
}

const SAVE_DEBOUNCE_MS = 500;

const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [project, setProject] = useState<StudioProject | null>(null);
  const [tab, setTab] = useState<MainTab>('write');
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [continuityReport, setContinuityReport] = useState<ContinuityReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // Metadata (title/codex/covers/chapter headers) and each chapter's manuscript save on
  // separate debounced timers, so typing in one chapter never re-serializes the whole book —
  // only that chapter's file, plus project.json when something outside the prose changed.
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapterTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingMeta = useRef<StudioProject | null>(null);
  const pendingChapters = useRef<Map<string, StudioChapter>>(new Map());

  useEffect(() => {
    if (!id) return;
    getProject(id).then((p) => {
      setProject(p);
      if (p?.chapters[0]) {
        setSelectedChapterId(p.chapters[0].id);
        setSelectedSectionId(p.chapters[0].sections[0]?.id ?? null);
      }
      if (p) void indexProject(p); // best-effort background (re)index on open
    });
  }, [id]);

  const flushMeta = useCallback(async () => {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = null;
    const next = pendingMeta.current;
    pendingMeta.current = null;
    if (next) await saveProjectMeta(next);
  }, []);

  const flushChapter = useCallback(async (chapterId: string) => {
    const timer = chapterTimers.current.get(chapterId);
    if (timer) clearTimeout(timer);
    chapterTimers.current.delete(chapterId);
    const chapter = pendingChapters.current.get(chapterId);
    pendingChapters.current.delete(chapterId);
    if (project && chapter) await saveChapterManuscript(project.id, chapter);
  }, [project]);

  /** Debounced metadata save: title, synopsis, genre, language, cover, codex, chapter headers. */
  const persistMeta = useCallback((next: StudioProject) => {
    setProject(next);
    pendingMeta.current = next;
    setSaving(true);
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(async () => {
      await flushMeta();
      setSaving(false);
    }, SAVE_DEBOUNCE_MS);
  }, [flushMeta]);

  /** Debounced manuscript save: one chapter's sections, the fast point-update path. */
  const persistChapter = useCallback((next: StudioProject, chapter: StudioChapter) => {
    setProject(next);
    pendingChapters.current.set(chapter.id, chapter);
    setSaving(true);
    const existing = chapterTimers.current.get(chapter.id);
    if (existing) clearTimeout(existing);
    chapterTimers.current.set(chapter.id, setTimeout(async () => {
      await flushChapter(chapter.id);
      setSaving(false);
    }, SAVE_DEBOUNCE_MS));
  }, [flushChapter]);

  /** Explicit Save button: flush everything pending right now, instead of waiting on debounce. */
  const saveNow = useCallback(async () => {
    setSaving(true);
    await flushMeta();
    await Promise.all([...pendingChapters.current.keys()].map((chapterId) => flushChapter(chapterId)));
    setSaving(false);
  }, [flushMeta, flushChapter]);

  if (!project) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-zinc-500 text-sm">Loading…</div>;
  }

  const chapter: StudioChapter | undefined = project.chapters.find((c) => c.id === selectedChapterId);
  const section: Section | undefined = chapter?.sections.find((s) => s.id === selectedSectionId);

  const updateSectionContent = (content: string) => {
    if (!chapter || !section) return;
    const sections = chapter.sections.map((s) => (s.id === section.id ? { ...s, content, lastEditedAt: new Date().toISOString() } : s));
    const nextChapter = { ...chapter, sections };
    const chapters = project.chapters.map((c) => (c.id === chapter.id ? nextChapter : c));
    persistChapter({ ...project, chapters }, nextChapter);
  };

  /** Memory continuity: re-index the edited section's RAG vectors and refresh the chapter's running summary. */
  const reconcileMemory = async (targetChapter: StudioChapter, targetSection: Section) => {
    await indexSection(project.id, targetChapter.chapterNumber, targetSection);
    const summary = await summarizeChapter(project, targetChapter).catch(() => targetChapter.summary);
    const chapters = project.chapters.map((c) => (c.id === targetChapter.id ? { ...c, summary } : c));
    persistMeta({ ...project, chapters }); // summary lives in the metadata file, not the chapter file
  };

  const addChapter = () => {
    const chapterNumber = project.chapters.length + 1;
    const newChapter: StudioChapter = {
      id: crypto.randomUUID(),
      chapterNumber,
      title: `Chapter ${chapterNumber}`,
      summary: '',
      sections: [newSection(0)],
      coverHistory: [],
      status: 'draft',
    };
    const nextProject = { ...project, chapters: [...project.chapters, newChapter] };
    persistMeta(nextProject); // new chapter header
    persistChapter(nextProject, newChapter); // its (empty) manuscript file
    setSelectedChapterId(newChapter.id);
    setSelectedSectionId(newChapter.sections[0].id);
  };

  const addSection = () => {
    if (!chapter) return;
    const section = newSection(chapter.sections.length);
    const nextChapter = { ...chapter, sections: [...chapter.sections, section] };
    const chapters = project.chapters.map((c) => (c.id === chapter.id ? nextChapter : c));
    persistChapter({ ...project, chapters }, nextChapter);
    setSelectedSectionId(section.id);
  };

  const runAction = async (action: 'rewrite' | 'expand' | 'continuity') => {
    if (!chapter || !section) return;
    setBusyAction(action);
    setContinuityReport(null);
    try {
      if (action === 'rewrite') {
        const text = await rewriteSection(project, chapter, section, instruction);
        updateSectionContent(text);
        await reconcileMemory(chapter, { ...section, content: text });
      } else if (action === 'expand') {
        const addition = await expandSection(project, chapter, section);
        const merged = `${section.content}\n\n${addition}`;
        updateSectionContent(merged);
        await reconcileMemory(chapter, { ...section, content: merged });
      } else {
        const report = await fixContinuity(project, chapter, section);
        setContinuityReport(report);
      }
    } catch (err) {
      setContinuityReport({ issues: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowLeaveModal(true)} className="text-zinc-500 hover:text-zinc-300 text-sm">← Bookshelf</button>
          <input
            value={project.title}
            onChange={(e) => persistMeta({ ...project, title: e.target.value })}
            className="bg-transparent text-xl font-semibold text-zinc-100 outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{saving ? t('editor.saving') : ''}</span>
          <button
            onClick={() => void saveNow()}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-indigo-500"
          >
            {t('editor.save')}
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-indigo-500"
          >
            {t('common.exportAs')}
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit">
        {(['write', 'codex', 'covers', 'usage'] as MainTab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-3 py-1.5 text-sm rounded-md ${tab === tb ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {t(`editor.tab.${tb === 'write' ? 'write' : tb === 'codex' ? 'codex' : tb === 'covers' ? 'covers' : 'usage'}`)}
          </button>
        ))}
      </div>

      {tab === 'write' && (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3 h-fit">
            <div>
              <h3 className="text-xs uppercase text-zinc-500 mb-2">{t('editor.chapters')}</h3>
              <div className="flex flex-col gap-1">
                {project.chapters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedChapterId(c.id); setSelectedSectionId(c.sections[0]?.id ?? null); }}
                    className={`text-left text-sm px-2 py-1 rounded-md ${c.id === selectedChapterId ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
                  >
                    {c.chapterNumber}. {c.title}
                  </button>
                ))}
              </div>
              <button onClick={addChapter} className="text-xs text-indigo-400 hover:text-indigo-300 mt-2">+ Chapter</button>
            </div>
            {chapter && (
              <div>
                <h3 className="text-xs uppercase text-zinc-500 mb-2">{t('editor.sections')}</h3>
                <div className="flex flex-col gap-1">
                  {chapter.sections.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSectionId(s.id)}
                      className={`text-left text-sm px-2 py-1 rounded-md ${s.id === selectedSectionId ? 'bg-indigo-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
                    >
                      Section {i + 1}
                    </button>
                  ))}
                </div>
                <button onClick={addSection} className="text-xs text-indigo-400 hover:text-indigo-300 mt-2">+ {t('editor.addSection')}</button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {section ? (
              <>
                <textarea
                  value={section.content}
                  onChange={(e) => updateSectionContent(e.target.value)}
                  onBlur={() => chapter && section && void reconcileMemory(chapter, section)}
                  className="w-full min-h-[400px] bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-zinc-100 text-sm leading-relaxed font-serif"
                />
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Rewrite instruction (tone, focus, style)…"
                    className="bg-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => runAction('rewrite')} disabled={!!busyAction} className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
                      {busyAction === 'rewrite' ? '…' : t('editor.rewrite')}
                    </button>
                    <button onClick={() => runAction('expand')} disabled={!!busyAction} className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200">
                      {busyAction === 'expand' ? '…' : t('editor.expand')}
                    </button>
                    <button onClick={() => runAction('continuity')} disabled={!!busyAction} className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200">
                      {busyAction === 'continuity' ? '…' : t('editor.fixContinuity')}
                    </button>
                  </div>
                  {continuityReport && (
                    <div className="text-xs text-zinc-300 bg-zinc-950 rounded-md p-2">
                      {continuityReport.issues.length === 0 ? (
                        <p className="text-emerald-400">No continuity issues found.</p>
                      ) : (
                        <ul className="list-disc list-inside space-y-1">
                          {continuityReport.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                        </ul>
                      )}
                      {continuityReport.suggestion && <p className="mt-1 text-zinc-400">Suggestion: {continuityReport.suggestion}</p>}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm">Select or add a chapter to start writing.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'codex' && (
        <CodexManager project={project} onUpdate={persistMeta} activeChapterNumber={chapter?.chapterNumber} />
      )}

      {tab === 'covers' && (
        <CoverPanel
          title={project.title}
          synopsis={project.synopsis}
          genre={project.genre}
          currentCover={project.coverImage}
          history={project.coverHistory}
          onChange={(coverImage, coverHistory) => persistMeta({ ...project, coverImage, coverHistory })}
        />
      )}

      {tab === 'usage' && (
        <div className="flex flex-col gap-3">
          <UsageWidget />
        </div>
      )}

      {showExport && <ExportAsModal project={project} onClose={() => setShowExport(false)} />}
      {showLeaveModal && (
        <SaveBeforeLeaveModal
          saving={saving}
          onCancel={() => setShowLeaveModal(false)}
          onLeaveWithoutSaving={() => { setShowLeaveModal(false); navigate('/'); }}
          onSaveAndLeave={() => {
            void saveNow().then(() => { setShowLeaveModal(false); navigate('/'); });
          }}
        />
      )}
    </div>
  );
};

export default ProjectWorkspace;
