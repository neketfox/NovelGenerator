import React, { useEffect, useId, useState } from 'react';
import { loadPreferences, savePreferences } from '../services/userPreferences';

type Theme = 'dark' | 'light' | 'autumn';

function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  if (root.classList.contains('autumn')) return 'autumn';
  if (root.classList.contains('light')) return 'light';
  return 'dark';
}

const NEXT: Record<Theme, Theme> = { dark: 'light', light: 'autumn', autumn: 'dark' };
const TITLES: Record<Theme, string> = {
  dark: 'Switch to light theme',
  light: 'Switch to cozy autumn theme',
  autumn: 'Switch to dark theme',
};

/** The document owns the theme; this only cycles it and remembers the choice. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const uniqueId = useId();
  const sunGradId = `sunGrad-${uniqueId}`;
  const moonGradId = `moonGrad-${uniqueId}`;
  const starGradId = `starGrad-${uniqueId}`;
  const leafGradId = `leafGrad-${uniqueId}`;

  // index.html's pre-paint script already applied the saved theme (from
  // data/user/preferences.json) to <html> before React mounted; this just reads that back.
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', theme === 'light');
    root.classList.toggle('autumn', theme === 'autumn');
    void savePreferences({ theme });
  }, [theme]);

  // Covers the case where preferences.json changed after this page already loaded.
  useEffect(() => {
    loadPreferences().then((prefs) => {
      if (prefs.theme === 'light' || prefs.theme === 'dark' || prefs.theme === 'autumn') setTheme(prefs.theme);
    });
  }, []);

  const buttonStyle =
    theme === 'light'
      ? 'border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100/80 hover:border-indigo-300 shadow-sm'
      : theme === 'autumn'
      ? 'border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/50 hover:border-amber-600/60 shadow-sm'
      : 'border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-amber-500/40 shadow-sm';

  return (
    <button
      type="button"
      onClick={() => setTheme((current) => NEXT[current])}
      title={TITLES[theme]}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 group ${buttonStyle} ${className}`}
    >
      {theme === 'light' && (
        <svg
          className="w-4 h-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110 filter drop-shadow-[0_1px_2px_rgba(99,102,241,0.3)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={moonGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>
            <linearGradient id={starGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill={`url(#${moonGradId})`}
            stroke="#6366F1"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 4l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z"
            fill={`url(#${starGradId})`}
          />
        </svg>
      )}
      {theme === 'dark' && (
        <svg
          className="w-4 h-4 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110 filter drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={sunGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="55%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#F59E0B" />
            </radialGradient>
          </defs>
          <circle
            cx="12"
            cy="12"
            r="4.5"
            fill={`url(#${sunGradId})`}
            stroke="#F59E0B"
            strokeWidth="1"
          />
          <path
            stroke="#FBBF24"
            strokeWidth="1.8"
            strokeLinecap="round"
            d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.28 5.28l1.42 1.42m10.6 10.6l1.42 1.42m0-13.44l-1.42 1.42m-10.6 10.6l-1.42 1.42"
          />
        </svg>
      )}
      {theme === 'autumn' && (
        <svg
          className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110 filter drop-shadow-[0_0_5px_rgba(194,101,45,0.4)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={leafGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="55%" stopColor="#C2652D" />
              <stop offset="100%" stopColor="#92400E" />
            </linearGradient>
          </defs>
          <path
            d="M12 21c-4.5-1-8-5-8-10 0-3 1.5-6 4-8 1 3 3 4 5 5 2.5 1.3 4 3.5 4 6 0 3.5-2.5 6.5-5 7z"
            fill={`url(#${leafGradId})`}
            stroke="#92400E"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path d="M12 21c0-5 1-9 4-13" stroke="#7C2D12" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      )}
      <span className="sr-only">{TITLES[theme]}</span>
    </button>
  );
}
