import { getDocument } from "./pdfEngine";
import type { PDFDocumentProxy } from "./pdfEngine";

/**
 * Preflight facts about a single PDF, read entirely in the renderer.
 *
 * Two sources feed this. pdf.js supplies the document metadata, the page
 * count and the page sizes. The colour information is not available through
 * pdf.js — its evaluator converts every colour operator to RGB before it
 * reaches the public operator list — so that comes from scanning the file's
 * own bytes, decompressing Flate streams so resource dictionaries and page
 * content inside object streams are seen too.
 */

export type ColorMode = "CMYK" | "RGB" | "Grayscale" | "Mixed" | "Unknown";

export interface PageBox {
  width: number;
  height: number;
}

export interface PdfStandard {
  /** "PDF/X-1a:2001", "PDF/A-2b", or "Standard PDF". */
  label: string;
  /** Where the answer came from, for the tooltip. */
  source: "xmp" | "info" | "raw" | "none";
}

export interface ColorReport {
  mode: ColorMode;
  /** Colour spaces seen, in a print operator's terms. */
  spaces: string[];
  /** Count of vector colour operators found in content streams. */
  operators: { cmyk: number; rgb: number; gray: number };
  /** How the mode was decided, shown beside the result. */
  basis: string;
}

export interface PdfInspection {
  fileName: string;
  fileSize: number;
  pageCount: number;
  pdfVersion: string | null;
  title: string | null;
  /** The application that made the document — InDesign, Illustrator, Word. */
  creator: string | null;
  /** The library that wrote the PDF — Adobe PDF Library, Ghostscript, Skia. */
  producer: string | null;
  standard: PdfStandard;
  color: ColorReport;
  /** First page's visible size, in PDF points (1/72 in). */
  pageSize: PageBox;
  uniformPageSize: boolean;
  /** Trim and bleed boxes, if the file declares them anywhere. In points. */
  trimBox: PageBox | null;
  bleedBox: PageBox | null;
  encrypted: boolean;
  linearized: boolean;
}

/** Bytes of decompressed content the colour scan will look at before stopping. */
const SCAN_BUDGET_BYTES = 48 * 1024 * 1024;

/** Files larger than this skip stream decompression and scan the raw bytes only. */
const DECOMPRESS_LIMIT_BYTES = 160 * 1024 * 1024;

const latin1 = new TextDecoder("latin1");

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function inspectPdf(file: File): Promise<{ inspection: PdfInspection; doc: PDFDocumentProxy }> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // pdf.js takes ownership of the buffer it is handed, so give it a copy and
  // keep ours for the byte scan.
  const task = getDocument({ data: bytes.slice() });
  const doc = await task.promise;

  const [{ info, metadata }, pages] = await Promise.all([
    doc.getMetadata(),
    readPageSizes(doc),
  ]);

  const infoRecord = (info ?? {}) as Record<string, unknown>;
  const custom = infoRecord.Custom instanceof Map ? (infoRecord.Custom as Map<string, unknown>) : null;
  const xmp = metadata ? metadataToMap(metadata) : new Map<string, string>();

  const raw = latin1.decode(bytes);
  const scan = await scanColorUsage(bytes, raw);
  const standard = detectStandard(xmp, custom, raw, infoRecord);

  const inspection: PdfInspection = {
    fileName: file.name,
    fileSize: file.size,
    pageCount: doc.numPages,
    pdfVersion: stringOrNull(infoRecord.PDFFormatVersion),
    title: stringOrNull(infoRecord.Title) ?? xmp.get("dc:title") ?? null,
    creator: stringOrNull(infoRecord.Creator) ?? xmp.get("xmp:creatortool") ?? null,
    producer: stringOrNull(infoRecord.Producer) ?? xmp.get("pdf:producer") ?? null,
    standard,
    color: classifyColor(scan, standard),
    pageSize: pages.first,
    uniformPageSize: pages.uniform,
    trimBox: findBox(raw, "TrimBox"),
    bleedBox: findBox(raw, "BleedBox"),
    encrypted: Boolean(infoRecord.EncryptFilterName),
    linearized: Boolean(infoRecord.IsLinearized),
  };

  return { inspection, doc };
}

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * pdf.js lowercases XMP property names, and sequences arrive as arrays.
 * Flatten to a plain lowercase-keyed map of strings.
 */
function metadataToMap(metadata: Iterable<[string, unknown]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of metadata) {
    const text = Array.isArray(value) ? value.map(String).join(", ") : String(value);
    if (text.trim()) map.set(key.toLowerCase(), text.trim());
  }
  return map;
}

function detectStandard(
  xmp: Map<string, string>,
  custom: Map<string, unknown> | null,
  raw: string,
  info: Record<string, unknown>,
): PdfStandard {
  // PDF/X, the one that matters for press work.
  const xmpX = xmp.get("pdfxid:gts_pdfxversion") ?? xmp.get("pdfx:gts_pdfxversion");
  if (xmpX) return { label: normaliseX(xmpX), source: "xmp" };

  const infoX = custom?.get("GTS_PDFXVersion");
  if (typeof infoX === "string" && infoX.trim()) return { label: normaliseX(infoX), source: "info" };

  // PDF/A and PDF/UA are worth naming too, so an archival file is not mistaken
  // for a press-ready one.
  const aPart = xmp.get("pdfaid:part");
  if (aPart) {
    const conformance = xmp.get("pdfaid:conformance") ?? "";
    return { label: `PDF/A-${aPart}${conformance.toLowerCase()}`, source: "xmp" };
  }
  const uaPart = xmp.get("pdfuaid:part");
  if (uaPart) return { label: `PDF/UA-${uaPart}`, source: "xmp" };

  const rawX = /\/GTS_PDFXVersion\s*\(([^)]*)\)/.exec(raw);
  if (rawX?.[1]) return { label: normaliseX(rawX[1]), source: "raw" };

  const version = stringOrNull(info.PDFFormatVersion);
  return { label: version ? `Standard PDF ${version}` : "Standard PDF", source: "none" };
}

/** "PDF/X-1a:2001" and "PDF/X-1:2001" both appear in the wild; keep the fuller form. */
function normaliseX(value: string) {
  return value.trim().replace(/^PDF\/?X/i, "PDF/X");
}

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

async function readPageSizes(doc: PDFDocumentProxy): Promise<{ first: PageBox; uniform: boolean }> {
  const firstPage = await doc.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const first = { width: firstViewport.width, height: firstViewport.height };

  let uniform = true;
  for (let index = 2; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const viewport = page.getViewport({ scale: 1 });
    if (Math.abs(viewport.width - first.width) > 0.5 || Math.abs(viewport.height - first.height) > 0.5) {
      uniform = false;
      break;
    }
  }

  return { first, uniform };
}

/** First declared box of this name anywhere in the file, as width × height. */
function findBox(raw: string, name: "TrimBox" | "BleedBox"): PageBox | null {
  const match = new RegExp(`/${name}\\s*\\[\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s*\\]`).exec(raw);
  if (!match) return null;
  const [x0, y0, x1, y1] = match.slice(1, 5).map(Number);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  return width > 0 && height > 0 ? { width, height } : null;
}

// ---------------------------------------------------------------------------
// Colour scan
// ---------------------------------------------------------------------------

interface ColorScan {
  device: { cmyk: boolean; rgb: boolean; gray: boolean };
  icc: { n4: boolean; n3: boolean; n1: boolean };
  separation: boolean;
  deviceN: boolean;
  lab: boolean;
  cal: { rgb: boolean; gray: boolean };
  operators: { cmyk: number; rgb: number; gray: number };
  decompressed: boolean;
}

function emptyScan(): ColorScan {
  return {
    device: { cmyk: false, rgb: false, gray: false },
    icc: { n4: false, n3: false, n1: false },
    separation: false,
    deviceN: false,
    lab: false,
    cal: { rgb: false, gray: false },
    operators: { cmyk: 0, rgb: 0, gray: 0 },
    decompressed: false,
  };
}

const NUMBER = "-?\\d*\\.?\\d+";
const cmykOp = new RegExp(`(?:^|\\s)${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+[kK](?=\\s|$)`, "g");
const rgbOp = new RegExp(`(?:^|\\s)${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+(?:rg|RG)(?=\\s|$)`, "g");
const grayOp = new RegExp(`(?:^|\\s)${NUMBER}\\s+[gG](?=\\s|$)`, "g");

function countMatches(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text)) count += 1;
  return count;
}

/** Colour space names and operators in one chunk of (decompressed) PDF syntax. */
function scanText(text: string, into: ColorScan) {
  if (/\/DeviceCMYK\b/.test(text)) into.device.cmyk = true;
  if (/\/DeviceRGB\b/.test(text)) into.device.rgb = true;
  if (/\/DeviceGray\b/.test(text)) into.device.gray = true;
  if (/\/Separation\b/.test(text)) into.separation = true;
  if (/\/DeviceN\b/.test(text)) into.deviceN = true;
  if (/\/Lab\b/.test(text)) into.lab = true;
  if (/\/CalRGB\b/.test(text)) into.cal.rgb = true;
  if (/\/CalGray\b/.test(text)) into.cal.gray = true;

  // ICC profiles are streams whose dictionary carries the channel count as /N.
  // /N also means an exponent in function dictionaries and an object count in
  // object streams, so those are ruled out before a match counts.
  const dictPattern = /<<[^<>]{0,400}?\/N\s*([134])\b[^<>]{0,400}?>>/g;
  let dict: RegExpExecArray | null;
  while ((dict = dictPattern.exec(text))) {
    const body = dict[0];
    if (/\/FunctionType|\/ObjStm/.test(body)) continue;
    if (!/\/Alternate|\/Filter|\/Length/.test(body)) continue;
    if (dict[1] === "4") into.icc.n4 = true;
    else if (dict[1] === "3") into.icc.n3 = true;
    else into.icc.n1 = true;
  }

  into.operators.cmyk += countMatches(text, cmykOp);
  into.operators.rgb += countMatches(text, rgbOp);
  into.operators.gray += countMatches(text, grayOp);
}

async function scanColorUsage(bytes: Uint8Array, raw: string): Promise<ColorScan> {
  const scan = emptyScan();
  scanText(raw, scan);

  if (bytes.byteLength > DECOMPRESS_LIMIT_BYTES || typeof DecompressionStream === "undefined") {
    return scan;
  }

  // Walk every Flate stream that could hold page content or a resource
  // dictionary. Images, fonts and the cross-reference stream carry no colour
  // syntax and can be large, so they are skipped on their dictionary alone.
  let budget = SCAN_BUDGET_BYTES;
  const streamPattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while (budget > 0 && (match = streamPattern.exec(raw))) {
    const dataStart = match.index + match[0].length;
    const dict = raw.slice(Math.max(0, match.index - 600), match.index);

    if (!/\/FlateDecode/.test(dict)) continue;
    // Images, embedded fonts, the xref stream, XMP and ICC profiles: no colour
    // syntax inside, and the profiles and images can run to megabytes.
    if (/\/Subtype\s*\/Image|\/Length1\b|\/Type\s*\/XRef|\/Type\s*\/Metadata|\/Alternate/.test(dict)) continue;
    if (/\/N\s*[134]\b/.test(dict) && !/\/ObjStm/.test(dict)) continue;

    const end = raw.indexOf("endstream", dataStart);
    if (end < 0) break;

    let dataEnd = end;
    while (dataEnd > dataStart && (raw[dataEnd - 1] === "\n" || raw[dataEnd - 1] === "\r")) dataEnd -= 1;

    const inflated = await inflate(bytes.subarray(dataStart, dataEnd), budget);
    streamPattern.lastIndex = end;
    if (!inflated) continue;

    budget -= inflated.byteLength;
    scan.decompressed = true;
    scanText(latin1.decode(inflated), scan);
  }

  return scan;
}

/**
 * Inflates a zlib-wrapped Flate stream. Streams are often followed by a byte
 * or two the decompressor rejects, so whatever was produced before an error is
 * kept rather than thrown away.
 */
async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    try {
      while (total < limit) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.byteLength;
        }
      }
    } catch {
      // Trailing garbage after the zlib block; keep what was decoded.
    } finally {
      reader.releaseLock();
    }
  } catch {
    return null;
  }

  if (chunks.length === 0) return null;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function classifyColor(scan: ColorScan, standard: PdfStandard): ColorReport {
  const spaces: string[] = [];
  if (scan.device.cmyk) spaces.push("DeviceCMYK");
  if (scan.icc.n4) spaces.push("ICC-based CMYK");
  if (scan.separation) spaces.push("Separation (spot)");
  if (scan.deviceN) spaces.push("DeviceN");
  if (scan.device.rgb) spaces.push("DeviceRGB");
  if (scan.icc.n3) spaces.push("ICC-based RGB");
  if (scan.cal.rgb) spaces.push("CalRGB");
  if (scan.lab) spaces.push("Lab");
  if (scan.device.gray) spaces.push("DeviceGray");
  if (scan.icc.n1) spaces.push("ICC-based Gray");
  if (scan.cal.gray) spaces.push("CalGray");

  const hasCmyk = scan.device.cmyk || scan.icc.n4 || scan.separation || scan.deviceN || scan.operators.cmyk > 0;
  const hasRgb = scan.device.rgb || scan.icc.n3 || scan.cal.rgb || scan.lab || scan.operators.rgb > 0;
  const hasGray = scan.device.gray || scan.icc.n1 || scan.cal.gray || scan.operators.gray > 0;

  const isX1a = /PDF\/X-1a?\b/i.test(standard.label);
  const scope = scan.decompressed ? "content streams and resources" : "uncompressed syntax only";

  if (isX1a) {
    // PDF/X-1a forbids anything but CMYK, spot and gray; the conformance claim
    // is the answer even where the scan sees an sRGB profile in an output intent.
    return {
      mode: "CMYK",
      spaces,
      operators: scan.operators,
      basis: `Declared ${standard.label}, which permits only CMYK, spot and grayscale.`,
    };
  }

  let mode: ColorMode;
  if (hasCmyk && hasRgb) mode = "Mixed";
  else if (hasCmyk) mode = "CMYK";
  else if (hasRgb) mode = "RGB";
  else if (hasGray) mode = "Grayscale";
  else mode = "Unknown";

  const basis =
    mode === "Unknown"
      ? `No colour spaces or colour operators found in ${scope}.`
      : mode === "Mixed"
        ? `Both CMYK-family and RGB-family colour found in ${scope}. Check images and any placed RGB artwork.`
        : `From colour spaces and operators in ${scope}.`;

  return { mode, spaces, operators: scan.operators, basis };
}
