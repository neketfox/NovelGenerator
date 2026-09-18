import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { GENRE_CONFIGS } from '../utils/genrePrompts';

const dictionaries = Object.fromEntries(
  ['en', 'ru', 'uk'].map(lang => [lang, JSON.parse(fs.readFileSync(`i18n/${lang}.json`, 'utf-8')) as Record<string, string>]),
);

const TONES = [
  'serious', 'whimsical', 'dark', 'lighthearted', 'gritty', 'romantic', 'melancholic',
  'hopeful', 'cynical', 'sardonic', 'tender', 'brooding', 'playful', 'urgent', 'wistful',
  'eerie', 'satirical', 'epic', 'intimate', 'bittersweet', 'suspenseful',
];
const AUDIENCES = ['children', 'middle-grade', 'young-adult', 'adult', 'all-ages'];

describe('the creation form speaks the interface language', () => {
  it('names every genre the pipeline knows, in every language', () => {
    for (const key of Object.keys(GENRE_CONFIGS)) {
      for (const [lang, dictionary] of Object.entries(dictionaries)) {
        expect(dictionary[`genre.${key}.name`], `${lang} has no name for genre ${key}`).toBeTruthy();
        expect(dictionary[`genre.${key}.description`], `${lang} has no description for genre ${key}`).toBeTruthy();
      }
    }
  });

  it('translates every tone the dropdown offers', () => {
    for (const tone of TONES) {
      for (const [lang, dictionary] of Object.entries(dictionaries)) {
        expect(dictionary[`tone.${tone}`], `${lang} has no label for tone ${tone}`).toBeTruthy();
      }
    }
  });

  it('translates every age category', () => {
    for (const audience of AUDIENCES) {
      for (const [lang, dictionary] of Object.entries(dictionaries)) {
        expect(dictionary[`audience.${audience}`], `${lang} has no label for audience ${audience}`).toBeTruthy();
      }
    }
  });

  it('actually translates rather than repeating the English', () => {
    // A label copied from English reads as "translated" to a key check but not to a reader.
    for (const lang of ['ru', 'uk']) {
      const sameAsEnglish = [...TONES, ...AUDIENCES.map(a => `audience.${a}`)]
        .map(item => (item.startsWith('audience.') ? item : `tone.${item}`))
        .filter(key => dictionaries[lang][key] === dictionaries.en[key]);
      expect(sameAsEnglish, `${lang} leaves these in English`).toEqual([]);
    }
  });

  it('keeps the values the pipeline matches on in English, whatever the labels say', () => {
    // resolveGenreKey matches these keys; translating the value would break genre guidance.
    const form = fs.readFileSync('components/UserInput.tsx', 'utf-8');
    expect(form).toContain('<option key={key} value={key}>');
    expect(form).toContain('<option key={tone} value={tone}>');
    expect(form).toContain('<option key={audience} value={audience}>');
  });
});

describe('the interface is translated everywhere, not only on the form', () => {
  it('gives every English key a translation in every language', () => {
    for (const lang of ['ru', 'uk']) {
      const missing = Object.keys(dictionaries.en).filter(key => !dictionaries[lang][key]);
      expect(missing, `${lang} is missing these keys`).toEqual([]);
    }
  });

  it('carries the same interpolation holes into every translation', () => {
    // A translation that drops {{count}} renders a sentence with a hole in the middle.
    const holes = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
    for (const lang of ['ru', 'uk']) {
      const broken = Object.keys(dictionaries.en).filter(
        key => dictionaries[lang][key] && holes(dictionaries.en[key]).join() !== holes(dictionaries[lang][key]).join(),
      );
      expect(broken, `${lang} changes the variables of these keys`).toEqual([]);
    }
  });

  it('names the Word import in every language', () => {
    for (const key of ['dashboard.importBook', 'import.title', 'import.stage.reading', 'import.unresolved']) {
      for (const [lang, dictionary] of Object.entries(dictionaries)) {
        expect(dictionary[key], `${lang} has no ${key}`).toBeTruthy();
      }
    }
  });
});
