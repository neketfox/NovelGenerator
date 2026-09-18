import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Bookshelf from '../components/dashboard/Bookshelf';
import ImportBookModal from '../components/dashboard/ImportBookModal';
import { I18nProvider } from '../i18n';

vi.mock('../services/projectSlots', async () => ({
  listSlots: async () => [],
  deleteSlot: async () => {},
  saveSlot: async () => {},
  slugifyProjectName: (name: string) => name,
}));

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(<MemoryRouter><I18nProvider>{node}</I18nProvider></MemoryRouter>);

describe('the import card sits on the shelf beside the new-book card', () => {
  it('offers the import next to creating a book, not hidden in a menu', () => {
    const html = wrap(<Bookshelf />);
    expect(html).toContain('Import from Word');
    expect(html).toContain('Create New Book');
  });

  it('asks for the document, the language, and how much is left to write', () => {
    const html = wrap(<ImportBookModal onClose={() => {}} />);
    expect(html).toContain('Word document (.docx)');
    expect(html).toContain('accept=".docx"');
    expect(html).toContain('Manuscript language');
    expect(html).toContain('Chapters still to write');
    expect(html).toContain('Ukrainian');
  });

  it('cannot start an import before a document is chosen', () => {
    const html = wrap(<ImportBookModal onClose={() => {}} />);
    // The Import button is the only disabled one in the freshly opened modal.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Import<\/button>/);
  });
});
