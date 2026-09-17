import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Select } from './common/Select';
import { GEMINI_MODEL_NAME, MIN_CHAPTERS } from '../constants';
import { GENRE_CONFIGS } from '../utils/genrePrompts';
import { getStoredProviderConfig, getStoredValidatorConfig, saveStoredProviderConfig, saveStoredValidatorConfig } from '../services/llmService';
import { fetchOllamaModels } from '../services/ollamaService';
import { LLMProviderConfig, StorySettings } from '../types';

interface UserInputProps {
  storyPremise: string;
  setStoryPremise: (value: string) => void;
  numChapters: number;
  setNumChapters: (value: number) => void;
  genre: string;
  setGenre: (value: string) => void;
  storySettings: StorySettings;
  setStorySettings: (settings: StorySettings) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const UserInput: React.FC<UserInputProps> = ({
  storyPremise,
  setStoryPremise,
  numChapters,
  setNumChapters,
  genre,
  setGenre,
  storySettings,
  setStorySettings,
  onSubmit,
  isLoading,
}) => {
  const { t } = useI18n();
  // Collapsed by default: this is an advanced/rarely-changed section, and the story premise
  // below it is what a new session actually starts with.
  const [providerSectionOpen, setProviderSectionOpen] = useState(false);
  // Whether the genre field shows the preset dropdown or a free-text box: starts in text mode
  // whenever the incoming value isn't one of the known preset keys (e.g. a saved custom genre).
  const [genreIsCustom, setGenreIsCustom] = useState(() => !(genre in GENRE_CONFIGS));
  // The model fields show gemini-3.6-flash explicitly rather than leaving them blank with a
  // placeholder — same resolved model either way (an absent geminiModel already means "use the
  // default"), just visible instead of implied.
  const [providerConfig, setProviderConfig] = useState<LLMProviderConfig>(() => {
    const stored = getStoredProviderConfig();
    return { ...stored, geminiModel: stored.geminiModel ?? GEMINI_MODEL_NAME };
  });
  const [validator, setValidator] = useState<LLMProviderConfig & { enabled: boolean }>(() => {
    const stored = getStoredValidatorConfig();
    // Defaults to on: a separate editor model is the recommended configuration, and the
    // storage layer has no way to tell "never touched" apart from "explicitly turned off"
    // (both persist as no record) — so this session starts from the recommended default.
    return {
      ...(stored || getStoredProviderConfig()),
      geminiModel: stored?.geminiModel ?? GEMINI_MODEL_NAME,
      think: stored?.think ?? false,
      enabled: true,
    };
  });

  const updateValidator = (change: Partial<LLMProviderConfig & { enabled: boolean }>) => {
    const next = { ...validator, ...change };
    setValidator(next);
    saveStoredValidatorConfig(next.enabled ? next : undefined);
  };
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchStatus, setFetchStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleFetchOllamaModels = async () => {
    setIsFetchingModels(true);
    setFetchStatus(null);
    try {
      const models = await fetchOllamaModels(providerConfig.ollamaEndpoint);
      setOllamaModels(models);
      if (models.length > 0) {
        setFetchStatus({ success: true, message: t('wizard.userInput.foundModels', { count: models.length }) });
        if (!models.includes(providerConfig.ollamaModel)) {
          const updated = { ...providerConfig, ollamaModel: models[0] };
          setProviderConfig(updated);
          saveStoredProviderConfig(updated);
        }
      } else {
        setFetchStatus({
          success: false,
          message: t('wizard.userInput.emptyModelList')
        });
      }
    } catch (err: any) {
      setFetchStatus({
        success: false,
        message: err.message || t('wizard.userInput.ollamaConnectError')
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleFetchEditorModels = async () => {
    setIsFetchingModels(true);
    setFetchStatus(null);
    try {
      const models = await fetchOllamaModels(providerConfig.ollamaEndpoint);
      setOllamaModels(models);
      if (models.length > 0) {
        setFetchStatus({ success: true, message: t('wizard.userInput.foundModels', { count: models.length }) });
        if (!models.includes(validator.ollamaModel)) {
          updateValidator({ ollamaModel: models[0] });
        }
      } else {
        setFetchStatus({
          success: false,
          message: t('wizard.userInput.emptyModelList')
        });
      }
    } catch (err: any) {
      setFetchStatus({
        success: false,
        message: err.message || t('wizard.userInput.ollamaConnectError')
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numChapters >= MIN_CHAPTERS) {
      onSubmit();
    } else {
      alert(t('wizard.userInput.minChaptersAlert', { minChapters: MIN_CHAPTERS }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI Model Provider Section — collapsed by default, an advanced/rarely-changed setting */}
      <div className="border border-zinc-800 rounded p-4 md:p-5">
        <button
          type="button"
          onClick={() => setProviderSectionOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={providerSectionOpen}
        >
          <div>
            <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <span>{t('wizard.userInput.aiProviderHeading')}</span>
            </h3>
            <p className="text-xs text-zinc-500">{t('wizard.userInput.aiProviderDescription')}</p>
          </div>
          <span className={`text-zinc-500 text-sm transition-transform ${providerSectionOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {providerSectionOpen && (
        <>
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 mb-3 mt-3">
          <div className="inline-flex rounded bg-zinc-900 p-1 border border-zinc-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'gemini' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                providerConfig.provider === 'gemini'
                  ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {t('wizard.userInput.providerGemini')}
            </button>
            <button
              type="button"
              onClick={() => {
                const updated = { ...providerConfig, provider: 'ollama' as const };
                setProviderConfig(updated);
                saveStoredProviderConfig(updated);
              }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                providerConfig.provider === 'ollama'
                  ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {t('wizard.userInput.providerOllama')}
            </button>
          </div>
        </div>

        {/* Gemini Details */}
        {providerConfig.provider === 'gemini' && (
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                {t('wizard.userInput.geminiModelLabel')}
              </label>
              <Input
                type="text"
                value={providerConfig.geminiModel || ''}
                onChange={(e) => {
                  const typed = e.target.value.trim();
                  const updated = { ...providerConfig };
                  if (typed) updated.geminiModel = typed;
                  else delete updated.geminiModel;
                  setProviderConfig(updated);
                  saveStoredProviderConfig(updated);
                }}
                placeholder={GEMINI_MODEL_NAME}
                className="text-xs py-1.5 font-mono"
              />
              <p className="text-xs text-zinc-500 mt-1">
                {t('wizard.userInput.geminiModelHelp', { defaultModel: GEMINI_MODEL_NAME })}
              </p>
            </div>
          </div>
        )}

        {/* Ollama Details */}
        {providerConfig.provider === 'ollama' && (
          <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                  {t('wizard.userInput.ollamaEndpointLabel')}
                </label>
                <Input
                  type="text"
                  value={providerConfig.ollamaEndpoint}
                  onChange={(e) => {
                    const updated = { ...providerConfig, ollamaEndpoint: e.target.value };
                    setProviderConfig(updated);
                    saveStoredProviderConfig(updated);
                    if (validator.enabled && validator.provider === 'ollama') {
                      updateValidator({ ollamaEndpoint: e.target.value });
                    }
                  }}
                  placeholder="/api/ollama"
                  className="text-xs py-1.5"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  {t('wizard.userInput.ollamaEndpointHelp')}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-zinc-400">
                    {t('wizard.userInput.ollamaModelLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchOllamaModels}
                    disabled={isFetchingModels}
                    className="text-xs text-zinc-400 hover:text-zinc-300 underline font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    {isFetchingModels ? t('wizard.userInput.loading') : t('wizard.userInput.fetchOllamaModels')}
                  </button>
                </div>

                {ollamaModels.length > 0 ? (
                  <Select
                    value={providerConfig.ollamaModel}
                    onChange={(e) => {
                      const updated = { ...providerConfig, ollamaModel: e.target.value };
                      setProviderConfig(updated);
                      saveStoredProviderConfig(updated);
                    }}
                    className="text-xs py-1.5"
                  >
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type="text"
                    value={providerConfig.ollamaModel}
                    onChange={(e) => {
                      const updated = { ...providerConfig, ollamaModel: e.target.value };
                      setProviderConfig(updated);
                      saveStoredProviderConfig(updated);
                    }}
                    placeholder="llama3.1"
                    className="text-xs py-1.5"
                  />
                )}
                <p className="text-xs text-zinc-500 mt-1">
                  {ollamaModels.length > 0
                    ? t('wizard.userInput.selectedFromModels', { count: ollamaModels.length })
                    : t('wizard.userInput.clickFetchModels')}
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={providerConfig.think ?? false}
                onChange={(e) => {
                  const updated = { ...providerConfig, think: e.target.checked };
                  setProviderConfig(updated);
                  saveStoredProviderConfig(updated);
                }}
                className="accent-zinc-200"
              />
              <span className="font-medium">{t('wizard.userInput.reasoningLabel')}</span>
            </label>
            <p className="text-xs text-zinc-500">
              {t('wizard.userInput.reasoningHelp')}
            </p>

            <p className="text-xs text-zinc-500">
              {t('wizard.userInput.localChecksNote')}
            </p>

            {fetchStatus && (
              <div
                className={`text-xs px-3 py-2 rounded ${
                  fetchStatus.success
                    ? 'bg-emerald-950/40 text-emerald-300/90 border border-emerald-900/60'
                    : 'bg-red-950/40 text-red-300/90 border border-red-900/60'
                }`}
              >
                {fetchStatus.message}
              </div>
            )}
          </div>
        )}

        {/* Editor (critic) model — a different model than the writer catches blind spots
            the writer cannot see in its own prose. Off means the writer judges itself. */}
        <div className="mt-4 pt-3 border-t border-zinc-800 space-y-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={validator.enabled}
              onChange={(e) => updateValidator(e.target.checked
                // Entering with the writer's current endpoint so the editor never
                // points at a stale address from an older stored config.
                ? { enabled: true, ollamaEndpoint: providerConfig.ollamaEndpoint }
                : { enabled: false })}
              className="accent-zinc-200"
            />
            <span className="font-medium">{t('wizard.userInput.editorModelLabel')}</span>
          </label>
          <p className="text-xs text-zinc-500">
            {t('wizard.userInput.editorModelHelp')}
          </p>

          {validator.enabled && (
            <div className="space-y-3 animate-fade-in">
              <div className="inline-flex rounded bg-zinc-900 p-1 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => updateValidator({ provider: 'gemini' })}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    validator.provider === 'gemini'
                      ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  {t('wizard.userInput.providerGemini')}
                </button>
                <button
                  type="button"
                  onClick={() => updateValidator({ provider: 'ollama' })}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                    validator.provider === 'ollama'
                      ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-300'
                  }`}
                >
                  {t('wizard.userInput.providerOllama')}
                </button>
              </div>

              {validator.provider === 'gemini' ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                    {t('wizard.userInput.editorGeminiLabel')}
                  </label>
                  <Input
                    type="text"
                    value={validator.geminiModel || ''}
                    onChange={(e) => {
                      const typed = e.target.value.trim();
                      const change: Partial<LLMProviderConfig & { enabled: boolean }> = {};
                      if (typed) change.geminiModel = typed;
                      else change.geminiModel = undefined;
                      updateValidator(change);
                    }}
                    placeholder={GEMINI_MODEL_NAME}
                    className="text-xs py-1.5 font-mono"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    {t('wizard.userInput.editorGeminiHelp', { defaultModel: GEMINI_MODEL_NAME })}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-zinc-400">
                      {t('wizard.userInput.editorOllamaLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchEditorModels}
                      disabled={isFetchingModels}
                      className="text-xs text-zinc-400 hover:text-zinc-300 underline font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      {isFetchingModels ? t('wizard.userInput.loading') : t('wizard.userInput.fetchOllamaModels')}
                    </button>
                  </div>
                  {ollamaModels.length > 0 ? (
                    <Select
                      value={validator.ollamaModel}
                      onChange={(e) => updateValidator({ ollamaModel: e.target.value })}
                      className="text-xs py-1.5"
                    >
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type="text"
                      value={validator.ollamaModel}
                      onChange={(e) => updateValidator({ ollamaModel: e.target.value })}
                      placeholder="llama3.1"
                      className="text-xs py-1.5"
                    />
                  )}
                  <p className="text-xs text-zinc-500 mt-1">
                    {t('wizard.userInput.editorOllamaHelp')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      <div>
        <label htmlFor="storyPremise" className="block text-sm font-medium text-zinc-400 mb-1.5">
          {t('wizard.userInput.storyPremiseLabel')}
        </label>
        <TextArea
          id="storyPremise"
          value={storyPremise}
          onChange={(e) => setStoryPremise(e.target.value)}
          placeholder={t('wizard.userInput.storyPremisePlaceholder')}
          rows={5}
          required
          maxLength={2000}
        />
        <p className="text-xs text-zinc-500 mt-1">{t('wizard.userInput.storyPremiseMaxLength')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="genre" className="block text-sm font-medium text-zinc-400 mb-1.5">
            {t('wizard.userInput.genreLabel')}
          </label>
          {genreIsCustom ? (
            <div className="flex gap-2">
              <Input
                id="genre"
                type="text"
                autoComplete="off"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder={t('wizard.userInput.genreCustomPlaceholder')}
              />
              <button
                type="button"
                onClick={() => { setGenreIsCustom(false); setGenre(Object.keys(GENRE_CONFIGS)[0]); }}
                className="text-xs px-2 text-zinc-400 hover:text-zinc-200 whitespace-nowrap"
              >
                {t('wizard.userInput.genrePresetsLink')}
              </button>
            </div>
          ) : (
            <Select
              id="genre"
              value={genre}
              onChange={(e) => {
                if (e.target.value === '__custom__') { setGenreIsCustom(true); setGenre(''); }
                else setGenre(e.target.value);
              }}
            >
              {Object.entries(GENRE_CONFIGS).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.name} — {config.description}
                </option>
              ))}
              <option value="__custom__">{t('wizard.userInput.genreCustomOption')}</option>
            </Select>
          )}
        </div>

        <div>
          <label htmlFor="numChapters" className="block text-sm font-medium text-zinc-400 mb-1.5">
            {t('wizard.userInput.numChaptersLabel')}
          </label>
          <Input
            id="numChapters"
            type="number"
            value={numChapters}
            onChange={(e) => setNumChapters(Math.max(MIN_CHAPTERS, parseInt(e.target.value, 10) || MIN_CHAPTERS))}
            min={MIN_CHAPTERS}
            max={100}
            required
          />
           <p className="text-xs text-zinc-500 mt-1">{t('wizard.userInput.numChaptersHelp', { min: MIN_CHAPTERS })}</p>
        </div>

        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            ['targetAudience', t('wizard.userInput.fieldTargetAudience'), 'adult'],
            ['narrativeVoice', t('wizard.userInput.fieldNarrativeVoice'), 'third-limited'],
            ['tone', t('wizard.userInput.fieldTone'), 'serious'],
            ['writingStyle', t('wizard.userInput.fieldWritingStyle'), 'descriptive'],
          ] as const).map(([key, label, fallback]) => (
            <div key={key}>
              <label htmlFor={key} className="block text-sm font-medium text-zinc-400 mb-1.5">{label}</label>
              <Input id={key} value={storySettings[key] || fallback}
                onChange={event => setStorySettings({ ...storySettings, [key]: event.target.value })} />
            </div>
          ))}
          <div>
            <label htmlFor="targetWordsMin" className="block text-sm font-medium text-zinc-400 mb-1.5">{t('wizard.userInput.targetWordsLabel')}</label>
            <div className="flex items-center gap-2">
              <Input
                id="targetWordsMin"
                type="number" min={300} max={10000} step={100}
                value={storySettings.targetWordsPerChapterMin ?? 3000}
                onChange={event => setStorySettings({ ...storySettings, targetWordsPerChapterMin: Number(event.target.value) })}
              />
              <span className="text-zinc-500 text-sm">–</span>
              <Input
                id="targetWordsMax"
                type="number" min={300} max={10000} step={100}
                value={storySettings.targetWordsPerChapterMax ?? 5000}
                onChange={event => setStorySettings({ ...storySettings, targetWordsPerChapterMax: Number(event.target.value) })}
              />
            </div>
          </div>
          <div>
            <label htmlFor="tense" className="block text-sm font-medium text-zinc-400 mb-1.5">{t('wizard.userInput.tenseLabel')}</label>
            <Select id="tense" value={storySettings.tense || 'past'} onChange={event => setStorySettings({ ...storySettings, tense: event.target.value as StorySettings['tense'] })}>
              <option value="past">{t('wizard.userInput.tensePast')}</option><option value="present">{t('wizard.userInput.tensePresent')}</option>
            </Select>
          </div>
          <div>
            <label htmlFor="ending" className="block text-sm font-medium text-zinc-400 mb-1.5">{t('wizard.userInput.endingLabel')}</label>
            <Select id="ending" value={storySettings.ending || 'closed'} onChange={event => setStorySettings({ ...storySettings, ending: event.target.value as StorySettings['ending'] })}>
              <option value="closed">{t('wizard.userInput.endingClosed')}</option><option value="open">{t('wizard.userInput.endingOpen')}</option><option value="series">{t('wizard.userInput.endingSeries')}</option><option value="ongoing">{t('wizard.userInput.endingOngoing')}</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <p className="text-xs text-zinc-500">{t('wizard.userInput.sequentialNote')}</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isLoading || !storyPremise || numChapters < MIN_CHAPTERS} variant="primary">
          {isLoading ? t('wizard.userInput.generatingOutline') : t('wizard.userInput.startGeneration')}
        </Button>
      </div>

      <div className="mt-10 pt-8 border-t border-zinc-800 space-y-6 text-zinc-300">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase">
            {t('wizard.userInput.processHeading')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">{t('wizard.userInput.processOutlineTitle')}</h3>
            <p className="text-xs text-zinc-500">
              {t('wizard.userInput.processOutlineDesc')}
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">{t('wizard.userInput.processSceneTitle')}</h3>
            <p className="text-xs text-zinc-500">
              {t('wizard.userInput.processSceneDesc')}
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">{t('wizard.userInput.processContinuityTitle')}</h3>
            <p className="text-xs text-zinc-500">
              {t('wizard.userInput.processContinuityDesc')}
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-xs font-medium text-zinc-300 uppercase">{t('wizard.userInput.processAuditTitle')}</h3>
            <p className="text-xs text-zinc-500">
              {t('wizard.userInput.processAuditDesc')}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
};

export default UserInput;
