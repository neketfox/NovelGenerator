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
