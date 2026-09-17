import React, { useState } from 'react';
import { useI18n } from '../i18n';
import AuthorPromptModal from './AuthorPromptModal';
import { exportAsEpub, exportAsJSON, exportAsPdf, exportAsText, exportAsMarkdown, extractBookTitle, sanitizeFilename } from '../utils/exportUtils';

export default function SaveBook({ content, metadata = {}, draft = false }: { content: string; metadata?: Record<string, unknown>; draft?: boolean }) {
  const { t } = useI18n();
  const [format, setFormat] = useState('epub');
  const [authorOpen, setAuthorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filename = sanitizeFilename(extractBookTitle(content));
  const save = () => {
    setError('');
    try {
      if (format === 'txt') exportAsText(content.replace(/^#{1,6}\s+/gm, ''), `${filename}.txt`);
      else if (format === 'md') exportAsMarkdown(content, `${filename}.md`);
      // The report the book wrote about itself: the whole-book review's findings, the promises it
      // never paid, the places the plan did not hold, the chapters that gave up on a defect. All of
      // it was being produced and kept where only a developer would find it.
      else if (format === 'report') exportAsJSON(metadata, `${filename}-report.json`);
      else setAuthorOpen(true);
    } catch (error) { setError(String(error)); }
  };
  return <div className="shrink-0">
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={t('wizard.saveBook.formatLabel')} value={format} onChange={event => setFormat(event.target.value)} disabled={busy} className="bg-zinc-900 border border-zinc-700 rounded h-7 px-3 py-1 text-xs text-zinc-200">
        <option value="epub">{t('wizard.saveBook.formatEpub')}</option><option value="pdf">{t('wizard.saveBook.formatPdf')}</option><option value="txt">{t('wizard.saveBook.formatTxt')}</option><option value="md">{t('wizard.saveBook.formatMarkdown')}</option><option value="report">{t('wizard.saveBook.formatReport')}</option>
      </select>
      <button type="button" onClick={save} disabled={busy || !content.trim()} className="h-7 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-100 disabled:opacity-50">{busy ? t('wizard.saveBook.saving') : draft ? t('wizard.saveBook.saveDraft') : t('wizard.saveBook.saveBook')}</button>
      {draft && <span className="sr-only">{t('wizard.saveBook.draftNote')}</span>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    <AuthorPromptModal isOpen={authorOpen} defaultAuthor={typeof metadata.author === 'string' ? metadata.author : ''} onCancel={() => setAuthorOpen(false)} onConfirm={async author => {
      setAuthorOpen(false);
      setBusy(true);
      try {
        if (format === 'pdf') exportAsPdf(content, { ...metadata, author });
        else await exportAsEpub(content, { ...metadata, author }, `${filename}.epub`);
      } catch (error) { setError(String(error)); }
      finally { setBusy(false); }
    }} />
  </div>;
}
