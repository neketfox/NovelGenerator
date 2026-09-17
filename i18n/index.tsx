import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';
import ru from './ru.json';
import uk from './uk.json';
import type { StudioLanguage } from '../studioTypes';
import { loadPreferences, savePreferences } from '../services/userPreferences';

const dictionaries: Record<StudioLanguage, Record<string, string>> = { en, ru, uk };

/**
 * index.html's pre-paint script reads data/user/preferences.json via a synchronous XHR (the
 * same file this module reads asynchronously) and stashes the result before React mounts, so
 * the UI never flashes the wrong language while the async fetch below is still in flight.
 */
function detectDefault(): StudioLanguage {
  const prefetched = typeof window !== 'undefined'
    ? (window as { __studioPrefs__?: { language?: string } }).__studioPrefs__?.language
    : undefined;
  if (prefetched && prefetched in dictionaries) return prefetched as StudioLanguage;
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return (nav in dictionaries ? nav : 'en') as StudioLanguage;
}

interface I18nContextValue {
  language: StudioLanguage;
  setLanguage: (lang: StudioLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ''));
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<StudioLanguage>(detectDefault);

  // The instant default above is the pre-paint prefetch (or the browser's own language); this
  // async read is the one that stays current if the file changes after the page already loaded.
  useEffect(() => {
    loadPreferences().then((prefs) => {
      if (prefs.language && prefs.language in dictionaries) setLanguageState(prefs.language as StudioLanguage);
    });
  }, []);

  const setLanguage = useCallback((lang: StudioLanguage) => {
    setLanguageState(lang);
    void savePreferences({ language: lang });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
      return format(template, vars);
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
