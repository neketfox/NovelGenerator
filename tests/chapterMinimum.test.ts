import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { MIN_CHAPTERS } from '../constants';

/**
 * The chapter floor lives in one constant. It drifted once: the form allowed a single chapter
 * while the start handler still tested against a literal 3, so starting a one-chapter book
 * was refused by an alert that named a number nothing else used.
 */
describe('the chapter minimum has one source', () => {
  it('lets a book start from a single chapter', () => {
    expect(MIN_CHAPTERS).toBeLessThanOrEqual(1);
  });

  it('is never written as a literal in the pages that enforce it', () => {
    for (const file of ['App.tsx', 'components/UserInput.tsx']) {
      const source = fs.readFileSync(file, 'utf-8');
      const guards = source.match(/numChapters\s*[<>]=?\s*\d+/g) ?? [];
      expect(guards, `${file} compares numChapters against a literal`).toEqual([]);
    }
  });

  it('tells the author the minimum it actually enforces', () => {
    for (const lang of ['en', 'ru', 'uk']) {
      const dictionary = JSON.parse(fs.readFileSync(`i18n/${lang}.json`, 'utf-8'));
      // The message interpolates the constant rather than spelling a number that can go stale.
      expect(dictionary['wizard.app.validationAlert']).toContain('{{minChapters}}');
      expect(dictionary['wizard.userInput.minChaptersAlert']).toContain('{{minChapters}}');
    }
  });
});
