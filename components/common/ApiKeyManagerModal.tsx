import React, { useEffect, useState } from 'react';
import { addKeySlot, getKeyStatuses, removeKeySlot, onKeyPoolChange, type KeyStatus } from '../../services/geminiKeyPool';
import { getStoredProviderConfig, saveStoredProviderConfig } from '../../services/llmService';
import { fetchOllamaModels } from '../../services/ollamaService';
import type { LLMProviderConfig } from '../../types';
import { useI18n } from '../../i18n';

interface Props {
  onClose: () => void;
}

/**
 * Gemini keys, plus the same writer-provider toggle (Gemini/Ollama) the wizard's collapsed "AI
 * provider" section has — mirrored here so it's reachable without opening the wizard, and takes
 * effect immediately: llmService.ts re-reads this stored config on every model call, including
 * mid-generation, not just once at the start of a run.
 */
const ApiKeyManagerModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyStatus[]>(getKeyStatuses());
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [providerConfig, setProviderConfig] = useState<LLMProviderConfig>(() => getStoredProviderConfig());
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => onKeyPoolChange(() => setKeys(getKeyStatuses())), []);

  const updateProvider = (patch: Partial<LLMProviderConfig>) => {
    const next = { ...providerConfig, ...patch };
    setProviderConfig(next);
    saveStoredProviderConfig(next);
  };

  const handleAdd = () => {
    if (!key.trim()) return;
    addKeySlot(label.trim(), key.trim());
    setLabel('');
    setKey('');
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    try {
      const models = await fetchOllamaModels(providerConfig.ollamaEndpoint);
      setOllamaModels(models);
      if (models.length && !models.includes(providerConfig.ollamaModel)) {
        updateProvider({ ollamaModel: models[0] });
      }
    } catch {
      // Same as the wizard's own fetch button: a failed lookup just leaves the list empty.
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg text-zinc-100 mb-3">{t('keys.provider.title')}</h2>
        <div className="inline-flex rounded bg-zinc-950 p-1 border border-zinc-800 mb-3">
          <button
            type="button"
            onClick={() => updateProvider({ provider: 'gemini' })}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${providerConfig.provider === 'gemini' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Gemini
          </button>
          <button
            type="button"
            onClick={() => updateProvider({ provider: 'ollama' })}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${providerConfig.provider === 'ollama' ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Ollama
          </button>
        </div>

        {providerConfig.provider === 'ollama' && (
          <div className="flex flex-col gap-2 mb-4 bg-zinc-950 rounded-lg p-3">
            <label className="text-xs text-zinc-400">
              {t('keys.provider.endpoint')}
              <input
                value={providerConfig.ollamaEndpoint}
                onChange={(e) => updateProvider({ ollamaEndpoint: e.target.value })}
                placeholder="/api/ollama"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100"
              />
            </label>
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">{t('keys.provider.model')}</label>
              <button
                type="button"
                onClick={() => void handleFetchModels()}
                disabled={fetchingModels}
                className="text-xs text-zinc-400 hover:text-zinc-300 underline disabled:opacity-50"
              >
                {fetchingModels ? '…' : t('keys.provider.fetchModels')}
              </button>
            </div>
            {ollamaModels.length > 0 ? (
              <select
                value={providerConfig.ollamaModel}
                onChange={(e) => updateProvider({ ollamaModel: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100"
              >
                {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input
                value={providerConfig.ollamaModel}
                onChange={(e) => updateProvider({ ollamaModel: e.target.value })}
                placeholder="llama3.1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100"
              />
            )}
          </div>
        )}

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
