import JSZip from 'jszip';

/**
 * Reading a Word manuscript, without a new dependency: a .docx is a zip whose
 * word/document.xml holds the text, and JSZip is already here for exports.
 *
 * Nothing here calls a model. The file is turned into paragraphs, the paragraphs
 * into chapters, and that is all — an import that guesses wrong about where a
 * chapter starts should be legible and fixable, not buried inside a prompt.
 */
export interface DocxParagraph {
  text: string;
  /** Word's own outline level, when the paragraph is styled as a heading. */
  headingLevel: number | null;
}

export interface ImportedChapter {
  number: number;
  title: string;
  text: string;
}

const CHAPTER_HEADING = /^\s*(?:глав[аы]|розділ|разделы?|раздел|chapter|part|частина|часть)\s*[:.\-–—]?\s*(\d+|[ivxlc]+|[a-zа-яіїєґ]+)?\b/i;

/** A short line on its own that announces a chapter — the common case when no heading style was used. */
export function looksLikeChapterHeading(paragraph: DocxParagraph): boolean {
  const text = paragraph.text.trim();
  if (!text || text.length > 120) return false;
  if (CHAPTER_HEADING.test(text)) return true;
  // A bare number on its own line is a chapter number in almost every manuscript.
  if (/^\d{1,3}[.)]?$/.test(text)) return true;
  return paragraph.headingLevel !== null && paragraph.headingLevel <= 2;
}

/**
 * The paragraphs of word/document.xml, in order. `<w:p>` is a paragraph and `<w:t>` its
 * runs of text; `<w:tab/>` and `<w:br/>` are whitespace. Everything else is formatting
 * this import has no use for.
 */
export function parseDocumentXml(xml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/g)) {
    const body = match[1] ?? '';
    const runs: string[] = [];
    for (const run of body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) runs.push(decodeXml(run[1]));
    const text = runs.join('').replace(/\s+/g, ' ').trim();
    const style = /<w:pStyle[^>]*w:val="([^"]*)"/i.exec(body)?.[1] ?? '';
    const outline = /<w:outlineLvl[^>]*w:val="(\d+)"/i.exec(body)?.[1];
    const styleLevel = /^heading\s*(\d)$/i.exec(style)?.[1] ?? /^(\d)$/.exec(style.replace(/^heading/i, ''))?.[1];
    const headingLevel = outline !== undefined
      ? Number(outline) + 1
      : styleLevel !== undefined
        ? Number(styleLevel)
        : /^heading/i.test(style) ? 1 : null;
    if (text || headingLevel !== null) paragraphs.push({ text, headingLevel });
  }
  return paragraphs;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

/**
 * Chapters out of paragraphs. A heading opens a chapter and everything until the next
 * heading is its body; prose before the first heading is chapter one, because a manuscript
 * that opens straight into the story is not a manuscript with a missing chapter. A document
 * with no headings at all is one chapter — better one honest chapter than an arbitrary split.
 */
export function splitChapters(paragraphs: DocxParagraph[]): ImportedChapter[] {
  const chapters: ImportedChapter[] = [];
  let title = '';
  let body: string[] = [];
  const flush = () => {
    const text = body.join('\n\n').trim();
    if (!text) return;
    chapters.push({ number: chapters.length + 1, title: title.trim() || `Chapter ${chapters.length + 1}`, text });
    body = [];
  };
  for (const paragraph of paragraphs) {
    if (looksLikeChapterHeading(paragraph)) {
      flush();
      title = paragraph.text;
      continue;
    }
    if (paragraph.text) body.push(paragraph.text);
  }
  flush();
  return chapters.map((chapter, index) => ({ ...chapter, number: index + 1 }));
}

/** Read a .docx file into chapters. Throws with a readable reason on anything that is not one. */
export async function readDocxChapters(data: ArrayBuffer | Uint8Array): Promise<ImportedChapter[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('That file is not a .docx — Word documents are zip archives, and this one is not.');
  }
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('The archive has no word/document.xml, so it is not a Word document.');
  const chapters = splitChapters(parseDocumentXml(await entry.async('string')));
  if (!chapters.length) throw new Error('The document holds no text to import.');
  return chapters;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
