import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readDocxChapters, countWords, type ImportedChapter } from '../../utils/import/docx';
import { importManuscript, type ImportResult, type ImportStage } from '../../utils/import/ingest';
import { importLlm } from '../../utils/import/llm';
import { saveSlot, slugifyProjectName } from '../../services/projectSlots';
import { useI18n } from '../../i18n';

const LANGUAGES = ['Ukrainian', 'Russian', 'English'];

/**
 * Importing a book someone already started writing. The document is split into chapters
 * in the browser first and shown as it was understood, because the one thing a person
 * must be able to correct before any model is called is where the chapters begin.
 *
 * Everything after that produces a project slot exactly like any other book's, so the
 * imported book opens on the same page, keeps the same memory, and continues the same way.
 */
const ImportBookModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<ImportedChapter[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [additional, setAdditional] = useState(3);
  const [edit, setEdit] = useState(true);
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState<ImportStage | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [slotId, setSlotId] = useState('');

  const pickFile = async (file: File) => {
    setError('');
    setResult(null);
    try {
      const parsed = await readDocxChapters(await file.arrayBuffer());
      setChapters(parsed);
      setFileName(file.name);
    } catch (failure) {
      setChapters(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const run = async () => {
    if (!chapters) return;
    setError('');
    setStage({ kind: 'reading', chapter: 1, of: chapters.length });
    try {
      const imported = await importManuscript(
        chapters,
        { additionalChapters: additional, language, authorRequirements: notes, edit },
        importLlm(),
        setStage,
      );
      const id = slugifyProjectName(imported.design.contract?.working_title || fileName.replace(/\.docx$/i, ''));
      await saveSlot(id, imported.snapshot);
      setSlotId(id);
      setResult(imported);
      setStage({ kind: 'done' });
    } catch (failure) {
      setStage(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const busy = stage !== null && stage.kind !== 'done';
  const stageLabel = !stage ? '' :
    stage.kind === 'reading' ? t('import.stage.reading', { chapter: stage.chapter, of: stage.of }) :
    stage.kind === 'designing' ? t('import.stage.designing') :
    stage.kind === 'editing' ? t('import.stage.editing', { chapter: stage.chapter, of: stage.of }) :
    t('import.stage.done');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">{t('import.title')}</h2>
        <p className="text-xs text-zinc-500 mb-5">{t('import.subtitle')}</p>

        {!result && (
          <>
            <label className="block mb-4">
              <span className="text-xs text-zinc-400">{t('import.file')}</span>
              <input
                type="file"
                accept=".docx"
                disabled={busy}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void pickFile(file); }}
                className="mt-1 block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-200"
              />
            </label>

            {chapters && (
              <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-400 mb-2">{t('import.found', { count: chapters.length })}</p>
                <ul className="max-h-40 overflow-y-auto text-xs text-zinc-500 space-y-1">
                  {chapters.map((chapter) => (
                    <li key={chapter.number} className="flex justify-between gap-3">
                      <span className="truncate text-zinc-300">{chapter.number}. {chapter.title}</span>
                      <span className="shrink-0">{countWords(chapter.text)} w</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="block">
                <span className="text-xs text-zinc-400">{t('import.language')}</span>
                <select value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value)} className="mt-1 w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200">
                  {LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400">{t('import.additional')}</span>
                <input
                  type="number" min={0} max={60} value={additional} disabled={busy}
                  onChange={(event) => setAdditional(Math.max(0, Number(event.target.value) || 0))}
                  className="mt-1 w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 mb-4 text-sm text-zinc-300">
              <input type="checkbox" checked={edit} disabled={busy} onChange={(event) => setEdit(event.target.checked)} />
              {t('import.edit')}
            </label>

            <label className="block mb-5">
              <span className="text-xs text-zinc-400">{t('import.notes')}</span>
              <textarea
                value={notes} rows={2} disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200"
              />
            </label>
          </>
        )}

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        {busy && <p className="mb-4 text-sm text-indigo-400">{stageLabel}</p>}

        {result && (
          <div className="mb-5 space-y-3 text-sm">
            <p className="text-emerald-400">{t('import.ready', { title: result.design.contract?.working_title || '' })}</p>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
              <p className="text-zinc-300 mb-1">{t('import.changesMade', { count: result.changes.length })}</p>
              <ul className="max-h-32 overflow-y-auto space-y-1">
                {result.changes.map((change, index) => (
                  <li key={index}>ch{change.chapter}: {change.why}</li>
                ))}
              </ul>
              {result.unresolved.length > 0 && (
                <>
                  <p className="text-amber-400 mt-2 mb-1">{t('import.unresolved', { count: result.unresolved.length })}</p>
                  <ul className="max-h-24 overflow-y-auto space-y-1">
                    {result.unresolved.map((item, index) => <li key={index}>ch{item.chapter}: {item.problem}</li>)}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-40">
            {result ? t('import.close') : t('import.cancel')}
          </button>
          {!result && (
            <button
              onClick={() => void run()}
              disabled={!chapters || busy}
              className="px-4 py-1.5 rounded-md bg-indigo-600 text-sm text-white disabled:opacity-40"
            >
              {busy ? t('import.working') : t('import.start')}
            </button>
          )}
          {result && (
            <button
              onClick={() => navigate(`/project/${slotId}`)}
              className="px-4 py-1.5 rounded-md bg-indigo-600 text-sm text-white"
            >
              {t('import.open')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportBookModal;
