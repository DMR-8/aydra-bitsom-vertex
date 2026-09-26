// This module is reached only through a dynamic import in the browser.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
export { getDocument };
export type { PDFDocumentProxy };
