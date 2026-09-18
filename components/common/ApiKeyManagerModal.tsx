import React, { useEffect, useState } from 'react';
import { addKeySlot, getKeyStatuses, removeKeySlot, onKeyPoolChange, type KeyStatus } from '../../services/geminiKeyPool';
import {
  getStoredProviderConfig,
  saveStoredProviderConfig,
  getStoredValidatorConfig,
  saveStoredValidatorConfig,
  providerSettingsLoaded,
} from '../../services/llmService';
import { fetchOllamaModels, DEFAULT_OLLAMA_NUM_CTX, MAX_OLLAMA_NUM_CTX } from '../../services/ollamaService';
import { GEMINI_MODEL_NAME } from '../../constants';
import type { LLMProviderConfig } from '../../types';
import { useI18n } from '../../i18n';

interface Props {
  onClose: () => void;
}

const field = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-100';
const hint = 'text-xs text-zinc-500 mt-1';

/**
 * Everything about which model runs this installation, in one place: the provider is chosen by
 * the tab, so Gemini's tab carries its model and the key pool that rotates through quota, and
 * Ollama's carries its endpoint and model. The editor model sits below both because it is a
 * second choice of the same kind — a reviewer that is not the writer.
 *
 * This is global and durable: every setting here lives in data/user/ beside the keys, not in a
 * book and not in the browser, so it holds across books, tabs and restarts.
 */
const ApiKeyManagerModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyStatus[]>(getKeyStatuses());
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [writer, setWriter] = useState<LLMProviderConfig>(getStoredProviderConfig());
  const [editor, setEditor] = useState<(LLMProviderConfig & { enabled: boolean })>(() => {
    const stored = getStoredValidatorConfig();
    return { ...(stored ?? getStoredProviderConfig()), think: stored?.think ?? false, enabled: Boolean(stored) };
  });
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchStatus, setFetchStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => onKeyPoolChange(() => setKeys(getKeyStatuses())), []);

  // The settings file is read once at startup; if this modal opened first, show what it holds
  // rather than the defaults it was initialised with.
  useEffect(() => {
    void providerSettingsLoaded().then(() => {
      setWriter(getStoredProviderConfig());
      const stored = getStoredValidatorConfig();
      setEditor({ ...(stored ?? getStoredProviderConfig()), think: stored?.think ?? false, enabled: Boolean(stored) });
    });
  }, []);

  // The list is what makes a model choosable at all, so it is fetched on opening rather than
  // behind a button: an author who has to press "fetch" before the editor field means anything
  // reads that field as broken. A machine with no Ollama running simply keeps the text inputs.
  useEffect(() => {
    if (writer.provider === 'ollama' || editor.provider === 'ollama') void handleFetchModels(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writer.provider, writer.ollamaEndpoint, editor.provider]);

  const updateWriter = (patch: Partial<LLMProviderConfig>) => {
    const next = { ...writer, ...patch };
    setWriter(next);
    saveStoredProviderConfig(next);
  };

  const updateEditor = (patch: Partial<LLMProviderConfig & { enabled: boolean }>) => {
    // The editor always speaks to the writer's Ollama, so a model that exists for one exists
    // for the other. Keeping a second endpoint here is how "the model does not exist" happened
    // for a model sitting right there in the writer's list.
    const next = { ...editor, ...patch, ollamaEndpoint: writer.ollamaEndpoint };
    setEditor(next);
    saveStoredValidatorConfig(next.enabled ? next : undefined);
  };

  const handleAddKey = () => {
    if (!key.trim()) return;
    addKeySlot(label.trim(), key.trim());
    setLabel('');
    setKey('');
  };

  const handleFetchModels = async (announce = true) => {
    setFetching(true);
    if (announce) setFetchStatus(null);
    try {
      const models = await fetchOllamaModels(writer.ollamaEndpoint);
      setOllamaModels(models);
      if (models.length) {
        if (announce) setFetchStatus({ ok: true, message: t('wizard.userInput.foundModels', { count: models.length }) });
        if (!models.includes(writer.ollamaModel)) updateWriter({ ollamaModel: models[0] });
      } else if (announce) {
        setFetchStatus({ ok: false, message: t('wizard.userInput.emptyModelList') });
      }
    } catch (error) {
      if (announce) setFetchStatus({ ok: false, message: error instanceof Error ? error.message : t('wizard.userInput.ollamaConnectError') });
    } finally {
      setFetching(false);
    }
  };

  const tab = (active: boolean) =>
    `px-3 py-1.5 rounded text-xs font-medium transition-all ${active ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-zinc-300'}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg text-zinc-100">{t('keys.provider.title')}</h2>
        <p className={hint}>{t('keys.provider.explainer')}</p>

        {/* The tab is the choice: whichever provider's settings you are looking at is the one
            that writes. There is no second switch that could disagree with it. */}
        <div className="inline-flex rounded bg-zinc-950 p-1 border border-zinc-800 my-3">
          <button type="button" onClick={() => updateWriter({ provider: 'gemini' })} className={tab(writer.provider === 'gemini')}>
            {t('wizard.userInput.providerGemini')}
          </button>
          <button type="button" onClick={() => updateWriter({ provider: 'ollama' })} className={tab(writer.provider === 'ollama')}>
            {t('wizard.userInput.providerOllama')}
          </button>
        </div>

        {writer.provider === 'gemini' ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm text-zinc-400">{t('wizard.userInput.geminiModelLabel')}</label>
              <input
                className={`${field} font-mono`}
                value={writer.geminiModel ?? GEMINI_MODEL_NAME}
                onChange={(e) => updateWriter({ geminiModel: e.target.value.trim() || undefined })}
                placeholder={GEMINI_MODEL_NAME}
              />
              <p className={hint}>{t('wizard.userInput.geminiModelHelp', { defaultModel: GEMINI_MODEL_NAME })}</p>
            </div>

            <div>
              <h3 className="text-sm text-zinc-300 mb-1">{t('keys.title')}</h3>
              <p className={hint}>{t('keys.rotationExplainer')}</p>
              <ul className="space-y-2 my-2 max-h-40 overflow-y-auto">
                {keys.map((slot) => (
                  <li key={slot.id} className="flex items-center justify-between bg-zinc-800 rounded-md px-3 py-2 text-sm">
                    <div>
                      <div className="text-zinc-200">{slot.label} {slot.isActive && <span className="text-indigo-400">●</span>}</div>
                      <div className="text-xs text-zinc-500">
                        {slot.cooldownRemainingMs > 0
                          ? t('keys.coolingDown', { seconds: Math.ceil(slot.cooldownRemainingMs / 1000) })
                          : t('keys.ready')}
                      </div>
                    </div>
                    <button onClick={() => removeKeySlot(slot.id)} className="text-zinc-500 hover:text-red-400 text-xs">
                      {t('keys.remove')}
                    </button>
                  </li>
                ))}
                {keys.length === 0 && <li className="text-zinc-500 text-sm">{t('keys.none')}</li>}
              </ul>
              <div className="flex flex-col gap-2">
                <input placeholder={t('keys.label')} value={label} onChange={(e) => setLabel(e.target.value)} className={field} />
                <input placeholder={t('keys.key')} value={key} onChange={(e) => setKey(e.target.value)} type="password" className={field} />
                <button onClick={handleAddKey} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md py-1.5 text-sm">
                  {t('keys.add')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm text-zinc-400">{t('wizard.userInput.ollamaEndpointLabel')}</label>
              <input
                className={field}
                value={writer.ollamaEndpoint}
                onChange={(e) => updateWriter({ ollamaEndpoint: e.target.value })}
                placeholder="/api/ollama"
              />
              <p className={hint}>{t('wizard.userInput.ollamaEndpointHelp')}</p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400">{t('wizard.userInput.ollamaModelLabel')}</label>
                <button
                  type="button"
                  onClick={() => void handleFetchModels()}
                  disabled={fetching}
                  className="text-xs text-zinc-400 hover:text-zinc-300 underline disabled:opacity-50"
                >
                  {fetching ? t('wizard.userInput.loading') : t('wizard.userInput.fetchOllamaModels')}
                </button>
              </div>
              {ollamaModels.length > 0 ? (
                <select className={field} value={writer.ollamaModel} onChange={(e) => updateWriter({ ollamaModel: e.target.value })}>
                  {ollamaModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              ) : (
                <input className={field} value={writer.ollamaModel} onChange={(e) => updateWriter({ ollamaModel: e.target.value })} placeholder="llama3.1" />
              )}
              <p className={hint}>
                {ollamaModels.length > 0
                  ? t('wizard.userInput.selectedFromModels', { count: ollamaModels.length })
                  : t('wizard.userInput.clickFetchModels')}
              </p>
            </div>

            <div>
              <label className="text-sm text-zinc-400">{t('wizard.userInput.contextWindowLabel')}</label>
              <input
                className={field}
                type="number"
                min={1024}
                step={1024}
                value={writer.ollamaNumCtx ?? DEFAULT_OLLAMA_NUM_CTX}
                onChange={(e) => updateWriter({ ollamaNumCtx: Math.max(1024, Number(e.target.value) || DEFAULT_OLLAMA_NUM_CTX) })}
              />
              <p className={hint}>{t('wizard.userInput.contextWindowHelp', { max: MAX_OLLAMA_NUM_CTX })}</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={writer.think ?? false}
                onChange={(e) => updateWriter({ think: e.target.checked })}
                className="accent-zinc-200"
              />
              <span className="font-medium">{t('wizard.userInput.reasoningLabel')}</span>
            </label>
            <p className={hint}>{t('wizard.userInput.reasoningHelp')}</p>

            {fetchStatus && (
              <div className={`text-xs px-3 py-2 rounded ${fetchStatus.ok
                ? 'bg-emerald-950/40 text-emerald-300/90 border border-emerald-900/60'
                : 'bg-red-950/40 text-red-300/90 border border-red-900/60'}`}>
                {fetchStatus.message}
              </div>
            )}
          </div>
        )}

        {/* The editor is the same kind of choice as the writer, so it lives under both tabs
            rather than inside one: an Ollama writer may still be reviewed by Gemini. */}
        <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={editor.enabled}
              onChange={(e) => updateEditor(e.target.checked
                // Entering with the writer's current endpoint, so the editor never points at a
                // stale address from an older stored config.
                ? { enabled: true, ollamaEndpoint: writer.ollamaEndpoint }
                : { enabled: false })}
              className="accent-zinc-200"
            />
            <span className="font-medium">{t('wizard.userInput.editorModelLabel')}</span>
          </label>
          <p className={hint}>{t('wizard.userInput.editorModelHelp')}</p>

          {editor.enabled && (
            <div className="flex flex-col gap-2">
              <div className="inline-flex rounded bg-zinc-950 p-1 border border-zinc-800 self-start">
                <button type="button" onClick={() => updateEditor({ provider: 'gemini' })} className={tab(editor.provider === 'gemini')}>
                  {t('wizard.userInput.providerGemini')}
                </button>
                <button type="button" onClick={() => updateEditor({ provider: 'ollama' })} className={tab(editor.provider === 'ollama')}>
                  {t('wizard.userInput.providerOllama')}
                </button>
              </div>
              {editor.provider === 'gemini' ? (
                <div>
                  <label className="text-sm text-zinc-400">{t('wizard.userInput.editorGeminiLabel')}</label>
                  <input
                    className={`${field} font-mono`}
                    value={editor.geminiModel ?? GEMINI_MODEL_NAME}
                    onChange={(e) => updateEditor({ geminiModel: e.target.value.trim() || undefined })}
                    placeholder={GEMINI_MODEL_NAME}
                  />
                  <p className={hint}>{t('wizard.userInput.editorGeminiHelp', { defaultModel: GEMINI_MODEL_NAME })}</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-400">{t('wizard.userInput.editorOllamaLabel')}</label>
                    <button
                      type="button"
                      onClick={() => void handleFetchModels()}
                      disabled={fetching}
                      className="text-xs text-zinc-400 hover:text-zinc-300 underline disabled:opacity-50"
                    >
                      {fetching ? t('wizard.userInput.loading') : t('wizard.userInput.fetchOllamaModels')}
                    </button>
                  </div>
                  {ollamaModels.length > 0 ? (
                    <select className={field} value={editor.ollamaModel} onChange={(e) => updateEditor({ ollamaModel: e.target.value })}>
                      {/* A stored choice that is no longer installed stays visible and stays
                          selected, so the author sees what is configured instead of silently
                          being moved onto another model. */}
                      {(ollamaModels.includes(editor.ollamaModel) ? ollamaModels : [editor.ollamaModel, ...ollamaModels])
                        .filter(Boolean)
                        .map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  ) : (
                    <input className={field} value={editor.ollamaModel} onChange={(e) => updateEditor({ ollamaModel: e.target.value.trim() })} placeholder="llama3.1" />
                  )}
                  <p className={hint}>{t('wizard.userInput.editorOllamaHelp')}</p>
                  <label className="text-sm text-zinc-400 mt-2 block">{t('wizard.userInput.contextWindowLabel')}</label>
                  <input
                    className={field}
                    type="number"
                    min={1024}
                    step={1024}
                    value={editor.ollamaNumCtx ?? writer.ollamaNumCtx ?? DEFAULT_OLLAMA_NUM_CTX}
                    onChange={(e) => updateEditor({ ollamaNumCtx: Math.max(1024, Number(e.target.value) || DEFAULT_OLLAMA_NUM_CTX) })}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <p className={`${hint} mt-3`}>{t('wizard.userInput.localChecksNote')}</p>

        <button onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">{t('common.close')}</button>
      </div>
    </div>
  );
};

export default ApiKeyManagerModal;
