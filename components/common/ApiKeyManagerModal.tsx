import React, { useEffect, useState } from 'react';
import { addKeySlot, getKeyStatuses, removeKeySlot, onKeyPoolChange, type KeyStatus } from '../../services/geminiKeyPool';
import { useI18n } from '../../i18n';

interface Props {
  onClose: () => void;
}

const ApiKeyManagerModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyStatus[]>(getKeyStatuses());
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => onKeyPoolChange(() => setKeys(getKeyStatuses())), []);

  const handleAdd = () => {
    if (!key.trim()) return;
    addKeySlot(label.trim(), key.trim());
    setLabel('');
    setKey('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg text-zinc-100 mb-3">{t('keys.title')}</h2>

        <ul className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between bg-zinc-800 rounded-md px-3 py-2 text-sm">
              <div>
                <div className="text-zinc-200">{k.label} {k.isActive && <span className="text-indigo-400">●</span>}</div>
                <div className="text-xs text-zinc-500">
                  {k.cooldownRemainingMs > 0
                    ? `Cooling down · resets in ${Math.ceil(k.cooldownRemainingMs / 1000)}s`
                    : 'Ready'}
                </div>
              </div>
              <button onClick={() => removeKeySlot(k.id)} className="text-zinc-500 hover:text-red-400 text-xs">
                {t('keys.remove')}
              </button>
            </li>
          ))}
          {keys.length === 0 && <li className="text-zinc-500 text-sm">No keys configured — using the default environment key.</li>}
        </ul>

        <div className="flex flex-col gap-2">
          <input
            placeholder={t('keys.label')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100"
          />
          <input
            placeholder={t('keys.key')}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100"
          />
          <button onClick={handleAdd} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md py-1.5 text-sm">
            {t('keys.add')}
          </button>
        </div>

        <button onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">{t('common.close')}</button>
      </div>
    </div>
  );
};

export default ApiKeyManagerModal;
