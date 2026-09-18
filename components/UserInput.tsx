import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';
import { Input } from './common/Input';
import { Select } from './common/Select';
import { MIN_CHAPTERS } from '../constants';
import { GENRE_CONFIGS } from '../utils/genrePrompts';
import { StorySettings } from '../types';

const TONE_PRESETS = [
  'serious', 'whimsical', 'dark', 'lighthearted', 'gritty', 'romantic', 'melancholic',
  'hopeful', 'cynical', 'sardonic', 'tender', 'brooding', 'playful', 'urgent', 'wistful',
  'eerie', 'satirical', 'epic', 'intimate', 'bittersweet', 'suspenseful',
];

/** English keys, translated only for display: the value is what author_requirements carries. */
const AUDIENCE_PRESETS = ['children', 'middle-grade', 'young-adult', 'adult', 'all-ages'];

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
  // Whether the genre field shows the preset dropdown or a free-text box: starts in text mode
  // whenever the incoming value isn't one of the known preset keys (e.g. a saved custom genre).
  const [genreIsCustom, setGenreIsCustom] = useState(() => !(genre in GENRE_CONFIGS));
  const [storyLanguageIsCustom, setStoryLanguageIsCustom] = useState(
    () => !!storySettings.storyLanguage && !['Ukrainian', 'Russian'].includes(storySettings.storyLanguage),
  );
  const [audienceIsCustom, setAudienceIsCustom] = useState(
    () => !!storySettings.targetAudience && !AUDIENCE_PRESETS.includes(storySettings.targetAudience),
  );
  const [toneIsCustom, setToneIsCustom] = useState(() => !!storySettings.tone && !TONE_PRESETS.includes(storySettings.tone));

  // The craft defaults are written in the interface language rather than shipped as English
  // constants, so a Ukrainian session starts from Ukrainian notes. Only fills what is still
  // empty: once the author has written their own, switching language never overwrites it.
  useEffect(() => {
    if (storySettings.narrativeVoice && storySettings.writingStyle) return;
    setStorySettings({
      ...storySettings,
      narrativeVoice: storySettings.narrativeVoice || t('wizard.userInput.defaultNarrativeVoice'),
      writingStyle: storySettings.writingStyle || t('wizard.userInput.defaultWritingStyle'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
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
      {/* The AI provider, its models and the Gemini key pool are global and live in the key
          manager (the header's key button), not in this form: they belong to the installation,
          not to one book, and a book started under one provider may be continued under another. */}
      <p className="text-xs text-zinc-500">{t('wizard.userInput.providerMovedNote')}</p>

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

      <div>
        <label htmlFor="storyLanguage" className="block text-sm font-medium text-zinc-400 mb-1.5">
          {t('wizard.userInput.storyLanguageLabel')}
        </label>
        {storyLanguageIsCustom ? (
          <div className="flex gap-2">
            <Input
              id="storyLanguage"
              type="text"
              autoComplete="off"
              value={storySettings.storyLanguage || ''}
              onChange={(e) => setStorySettings({ ...storySettings, storyLanguage: e.target.value })}
              placeholder={t('wizard.userInput.storyLanguageCustomPlaceholder')}
            />
            <button
              type="button"
              onClick={() => { setStoryLanguageIsCustom(false); setStorySettings({ ...storySettings, storyLanguage: undefined }); }}
              className="text-xs px-2 text-zinc-400 hover:text-zinc-200 whitespace-nowrap"
            >
              {t('wizard.userInput.genrePresetsLink')}
            </button>
          </div>
        ) : (
          <Select
            id="storyLanguage"
            value={storySettings.storyLanguage || ''}
            onChange={(e) => {
              if (e.target.value === '__custom__') { setStoryLanguageIsCustom(true); setStorySettings({ ...storySettings, storyLanguage: '' }); }
              else setStorySettings({ ...storySettings, storyLanguage: e.target.value || undefined });
            }}
          >
            <option value="">{t('wizard.userInput.storyLanguageEnglish')}</option>
            <option value="Ukrainian">Українська</option>
            <option value="Russian">Русский</option>
            <option value="__custom__">{t('wizard.userInput.genreCustomOption')}</option>
          </Select>
        )}
        <p className="text-xs text-zinc-500 mt-1">{t('wizard.userInput.storyLanguageHelp')}</p>
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
              {Object.keys(GENRE_CONFIGS).map((key) => (
                <option key={key} value={key}>
                  {t(`genre.${key}.name`)} — {t(`genre.${key}.description`)}
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
          <div>
            <label htmlFor="targetAudience" className="block text-sm font-medium text-zinc-400 mb-1.5">
              {t('wizard.userInput.fieldTargetAudience')}
            </label>
            {audienceIsCustom ? (
              <div className="flex gap-2">
                <Input
                  id="targetAudience"
                  type="text"
                  autoComplete="off"
                  value={storySettings.targetAudience || ''}
                  onChange={(e) => setStorySettings({ ...storySettings, targetAudience: e.target.value })}
                  placeholder={t('wizard.userInput.audienceCustomPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => { setAudienceIsCustom(false); setStorySettings({ ...storySettings, targetAudience: 'adult' }); }}
                  className="text-xs px-2 text-zinc-400 hover:text-zinc-200 whitespace-nowrap"
                >
                  {t('wizard.userInput.genrePresetsLink')}
                </button>
              </div>
            ) : (
              <Select
                id="targetAudience"
                value={storySettings.targetAudience || 'adult'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') { setAudienceIsCustom(true); setStorySettings({ ...storySettings, targetAudience: '' }); }
                  else setStorySettings({ ...storySettings, targetAudience: e.target.value });
                }}
              >
                {/* The value stays an English key: it travels into author_requirements, which the
                    model reads, while the label is what the author reads. */}
                {AUDIENCE_PRESETS.map((audience) => (
                  <option key={audience} value={audience}>{t(`audience.${audience}`)}</option>
                ))}
                <option value="__custom__">{t('wizard.userInput.genreCustomOption')}</option>
              </Select>
            )}
          </div>
          {([
            ['narrativeVoice', t('wizard.userInput.fieldNarrativeVoice'), 'third-limited'],
            ['writingStyle', t('wizard.userInput.fieldWritingStyle'), 'descriptive'],
          ] as const).map(([key, label, fallback]) => (
            <div key={key}>
              <label htmlFor={key} className="block text-sm font-medium text-zinc-400 mb-1.5">{label}</label>
              <Input id={key} value={storySettings[key] || fallback}
                onChange={event => setStorySettings({ ...storySettings, [key]: event.target.value })} />
            </div>
          ))}
          <div>
            <label htmlFor="tone" className="block text-sm font-medium text-zinc-400 mb-1.5">{t('wizard.userInput.fieldTone')}</label>
            {toneIsCustom ? (
              <div className="flex gap-2">
                <Input
                  id="tone"
                  type="text"
                  autoComplete="off"
                  value={storySettings.tone || ''}
                  onChange={(e) => setStorySettings({ ...storySettings, tone: e.target.value })}
                  placeholder="e.g. droll, feverish, wry…"
                />
                <button
                  type="button"
                  onClick={() => { setToneIsCustom(false); setStorySettings({ ...storySettings, tone: 'serious' }); }}
                  className="text-xs px-2 text-zinc-400 hover:text-zinc-200 whitespace-nowrap"
                >
                  {t('wizard.userInput.genrePresetsLink')}
                </button>
              </div>
            ) : (
              <Select
                id="tone"
                value={storySettings.tone || 'serious'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') { setToneIsCustom(true); setStorySettings({ ...storySettings, tone: '' }); }
                  else setStorySettings({ ...storySettings, tone: e.target.value });
                }}
              >
                {TONE_PRESETS.map((tone) => (
                  <option key={tone} value={tone}>{t(`tone.${tone}`)}</option>
                ))}
                <option value="__custom__">{t('wizard.userInput.genreCustomOption')}</option>
              </Select>
            )}
          </div>
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

      <div className="border border-zinc-800 rounded p-4 md:p-5">
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={storySettings.dialogueHeavyPov ?? false}
            onChange={(e) => setStorySettings({ ...storySettings, dialogueHeavyPov: e.target.checked })}
            className="accent-zinc-200"
          />
          <span className="font-medium">{t('wizard.userInput.dialogueHeavyLabel')}</span>
        </label>
        <p className="text-xs text-zinc-500 mt-1.5">{t('wizard.userInput.dialogueHeavyHelp')}</p>
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
