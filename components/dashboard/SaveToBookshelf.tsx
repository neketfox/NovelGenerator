import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

interface Props {
  saving: boolean;
  savedProjectId: string | null;
  hasContent: boolean;
  onSave: () => void;
  className?: string;
}

/** Presentational: the wizard (App.tsx) owns the actual save logic, shared with the
 *  "leave without losing this" prompt (see SaveBeforeLeaveModal). */
const SaveToBookshelf: React.FC<Props> = ({ saving, savedProjectId, hasContent, onSave, className }) => {
  const { t } = useI18n();
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !hasContent}
        title={hasContent ? undefined : 'Nothing generated yet'}
        className="h-7 text-xs px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? t('editor.saving') : t('editor.save')}
      </button>
      {savedProjectId && (
        <Link to={`/project/${savedProjectId}`} className="text-xs text-indigo-400 hover:text-indigo-300 whitespace-nowrap">
          {t('wizard.app.openInStudio')}
        </Link>
      )}
    </div>
  );
};

export default SaveToBookshelf;
