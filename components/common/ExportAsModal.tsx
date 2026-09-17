import React, { useState } from 'react';
import type { StudioProject } from '../../studioTypes';
import { exportAsMarkdown, exportAsJSON } from '../../utils/exportUtils';
import { exportProjectAsDocx, exportProjectAsPdf } from '../../services/exportDocuments';
import { useI18n } from '../../i18n';

interface Props {
  project: StudioProject;
  onClose: () => void;
}

type Format = 'json' | 'markdown' | 'docx' | 'pdf';

const FORMATS: Format[] = ['markdown', 'json', 'docx', 'pdf'];

const ExportAsModal: React.FC<Props> = ({ project, onClose }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState<Format | null>(null);

  const handleExport = async (format: Format) => {
    setBusy(format);
    try {
      if (format === 'markdown') {
        const content = project.chapters
          .map((c) => `# Chapter ${c.chapterNumber}: ${c.title}\n\n${c.sections.map((s) => s.content).join('\n\n')}`)
          .join('\n\n---\n\n');
        exportAsMarkdown(`# ${project.title}\n\n${project.synopsis}\n\n${content}`, `${project.title || 'book'}.md`);
      } else if (format === 'json') {
        exportAsJSON(project, `${project.title || 'book'}.json`);
      } else if (format === 'docx') {
        await exportProjectAsDocx(project);
      } else {
        exportProjectAsPdf(project);
      }
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg text-zinc-100 mb-3">{t('export.title')}</h2>
        <div className="flex flex-col gap-2">
          {FORMATS.map((key) => (
            <button
              key={key}
              onClick={() => void handleExport(key)}
              disabled={!!busy}
              className="text-left bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg px-3 py-2"
            >
              <div className="text-sm text-zinc-100">{busy === key ? '…' : t(`export.${key}.label`)}</div>
              <div className="text-xs text-zinc-500">{t(`export.${key}.hint`)}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">{t('common.close')}</button>
      </div>
    </div>
  );
};

export default ExportAsModal;
