import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export { getDocument };
export type { PDFDocumentProxy };
