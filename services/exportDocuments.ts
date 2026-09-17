/**
 * Formatted book export: DOCX and PDF, each with a cover page (title, synopsis, cover image
 * when set) followed by properly structured chapter/section text — not a plain text dump.
 * JSON/Markdown export already existed (utils/exportUtils.ts); this adds the two richer formats.
 */
import { Document, Packer, Paragraph, HeadingLevel, ImageRun, AlignmentType, PageBreak, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import type { StudioProject } from '../studioTypes';
import { downloadBlob } from '../utils/exportUtils';

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const [header, base64] = dataUrl.split(',');
  const mimeType = /data:(.*?);base64/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}

function paragraphsFromText(text: string): Paragraph[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({ text: p, spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED }));
}

export async function exportProjectAsDocx(project: StudioProject): Promise<void> {
  const coverImageRun = project.coverImage
    ? (() => {
        const { bytes } = dataUrlToBytes(project.coverImage!);
        return new ImageRun({ type: 'png', data: bytes, transformation: { width: 300, height: 420 } });
      })()
    : null;

  const titlePage: Paragraph[] = [
    ...(coverImageRun
      ? [new Paragraph({ children: [coverImageRun], alignment: AlignmentType.CENTER, spacing: { after: 400 } })]
      : []),
    new Paragraph({ text: project.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    ...(project.genre ? [new Paragraph({ text: project.genre, alignment: AlignmentType.CENTER, spacing: { before: 200 } })] : []),
    ...(project.synopsis
      ? [new Paragraph({ children: [new TextRun({ text: project.synopsis, italics: true })], alignment: AlignmentType.CENTER, spacing: { before: 400 } })]
      : []),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const chapterContent = project.chapters.flatMap((chapter, index) => [
    new Paragraph({
      text: `Chapter ${chapter.chapterNumber}: ${chapter.title}`,
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: index > 0,
      spacing: { after: 300 },
    }),
    ...chapter.sections.flatMap((section) => paragraphsFromText(section.content)),
  ]);

  const doc = new Document({
    sections: [{ children: [...titlePage, ...chapterContent] }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${project.title || 'book'}.docx`);
}

export function exportProjectAsPdf(project: StudioProject): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentWidth = pageWidth - margin * 2;

  // --- Cover page ---
  let cursorY = 80;
  if (project.coverImage) {
    const imgWidth = 220;
    const imgHeight = 300;
    doc.addImage(project.coverImage, (pageWidth - imgWidth) / 2, cursorY, imgWidth, imgHeight);
    cursorY += imgHeight + 40;
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.text(project.title || 'Untitled Book', pageWidth / 2, cursorY, { align: 'center', maxWidth: contentWidth });
  cursorY += 30;
  if (project.genre) {
    doc.setFont('times', 'normal');
    doc.setFontSize(13);
    doc.text(project.genre, pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 24;
  }
  if (project.synopsis) {
    doc.setFont('times', 'italic');
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(project.synopsis, contentWidth * 0.8);
    doc.text(lines, pageWidth / 2, cursorY, { align: 'center' });
  }

  // --- Chapters ---
  for (const chapter of project.chapters) {
    doc.addPage();
    let y = margin;
    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.text(`Chapter ${chapter.chapterNumber}: ${chapter.title}`, margin, y);
    y += 32;

    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    const text = chapter.sections.map((s) => s.content).join('\n\n');
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const lines = doc.splitTextToSize(paragraph, contentWidth);
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 16;
      }
      y += 10; // paragraph spacing
    }
  }

  doc.save(`${project.title || 'book'}.pdf`);
}
