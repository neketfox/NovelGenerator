import React from 'react';
import { useI18n } from '../../i18n';

interface Props {
  onSaveAndLeave: () => void;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
  saving: boolean;
}

/** Shown before navigating from the wizard or the project editor back to the dashboard. */
const SaveBeforeLeaveModal: React.FC<Props> = ({ onSaveAndLeave, onLeaveWithoutSaving, onCancel, saving }) => {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg text-zinc-100 mb-2">{t('leave.title')}</h2>
        <p className="text-sm text-zinc-400 mb-4">{t('leave.body')}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndLeave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {saving ? t('editor.saving') : t('leave.saveAndLeave')}
          </button>
          <button
            onClick={onLeaveWithoutSaving}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm"
          >
            {t('leave.leaveWithoutSaving')}
          </button>
          <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 mt-1">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveBeforeLeaveModal;
