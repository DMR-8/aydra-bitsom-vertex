import { isSupportedPageSize, classifyPamphletPaper, isPamphletPageCount } from '../paper';
import type { PdfInspection, PageBox } from './pdfInspector';
export function checkPreflight(inspection: PdfInspection, pages: PageBox[]) {
  const problems: string[] = [];
  const notes: string[] = [];
  if (inspection.encrypted) problems.push('Encrypted PDFs cannot be imposed. Upload an unlocked PDF.');
  const pamphlet = isPamphletPageCount(inspection.pageCount);
  pages.forEach((page, i) => {
    if (pamphlet) {
      if (!classifyPamphletPaper(page.width, page.height)) problems.push(`Page ${i+1} must be A5, 8.5 × 5.5 in, A4 or 8.5 × 11 in (±5 mm), in either orientation, for pamphlet imposition.`);
    } else if (!isSupportedPageSize(page.width, page.height))
      problems.push(`Page ${i + 1} is ${(page.width * 25.4 / 72).toFixed(2)} × ${(page.height * 25.4 / 72).toFixed(2)} mm. Every page must be A4 portrait: 210 × 297 mm (±5 mm per dimension).`);
  });
  if (!inspection.uniformPageSize) problems.push('Mixed page sizes are not supported.');
  if (!pamphlet && inspection.pageCount % 4) notes.push(`${4 - inspection.pageCount % 4} blank pages are needed before imposition.`);
  if (['RGB', 'Mixed'].includes(inspection.color.mode)) notes.push('RGB artwork detected. Colour is preserved; this app does not convert to CMYK.');
  return { problems, notes };
}
export async function preflightPdf(file: File) {
  const { inspectPdf } = await import('./pdfInspector');
  const { inspection, doc } = await inspectPdf(file);
  try {
    const pages: PageBox[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const view = (await doc.getPage(i)).getViewport({ scale: 1 });
      pages.push({ width: view.width, height: view.height });
    }
    return { inspection, ...checkPreflight(inspection, pages) };
  } finally { await doc.loadingTask.destroy(); }
}
export type PreflightResult = Awaited<ReturnType<typeof preflightPdf>>;
