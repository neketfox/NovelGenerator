import React from 'react';
import { useI18n } from '../../i18n';
import type { StudioLanguage } from '../../studioTypes';

const OPTIONS: { value: StudioLanguage; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'ru', label: 'RU' },
  { value: 'uk', label: 'UK' },
];

const LanguageSelector: React.FC = () => {
  const { language, setLanguage, t } = useI18n();
  return (
    <select
      aria-label={t('language.select')}
      value={language}
      onChange={(e) => setLanguage(e.target.value as StudioLanguage)}
      className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
};

export default LanguageSelector;
