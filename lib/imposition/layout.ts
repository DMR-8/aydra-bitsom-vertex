import type { PlateSetup } from './plateSettings';
import type {
  BindingEdge,
  ImpositionMethod,
  ImpositionSettings,
  PlateSetting,
  SourceSummary,
} from "./types";
import { buildMarks, type PlanMarks } from "./marks.ts";
import { pointsToMm } from "./units.ts";
import { packBookSpreads, type PackedSpread } from "./bookPacking.ts";

/**
 * Imposition planners ported from the Aydra CorelDRAW add-on. Everything here is in
 * millimetres with the origin at the sheet's top-left corner and y running downward,
 * which is what the SVG preview draws in; the Corel code works in inches with y
 * upward, so the vertical maths is mirrored but the placements are the same.
 */

export type SheetSide = "front" | "back";

export interface PlacedPage {
  /** 1-based page number across the whole job, or null for an empty slot. */
  page: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Turned 180° (head-to-head with the row below). */
  rotated: boolean;
  /** Clockwise rotation; width/height describe the rotated bounding box. */
  rotation?: 0 | 90 | 180 | 270;
}

export interface BookSpreadRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  foldAxis: "x" | "y";
  /** Fold lines inside the region, when there is more than the one centre fold. */
  folds?: { x: number[]; y: number[] };
}

export interface PlannedSheet {
  /** Shop plate artwork; absent on the unchanged reference planner output. */
  plate?: PlateSetup;
  guides?: { x: number[]; y: number[] };
  label: string;
  side?: SheetSide;
  /** One plate printing both sides of its sheet (Offset Book). */
  lotPot?: boolean;
  slots: PlacedPage[];
  bookSpreads?: BookSpreadRegion[];
  marks?: PlanMarks;
}

export interface ImpositionPlan {
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Set when the output page is a press plate rather than a sheet. */
  onPlate?: boolean;
  sheets: PlannedSheet[];
  /** Nothing can be generated until this is resolved. */
  error: string | null;
  /** Worth knowing, but generation can go ahead. */
  warnings: string[];
  summary: string;
  /** Edge band and corner keep-out, drawn by the preview for the grid methods. */
  marginMm?: number;
  cornerMm?: number;
  /** Fold and cut lines, as positions across (x) and down (y) the sheet. */
  guides?: { x: number[]; y: number[] };
  grid?: {
    columns: number;
    rows: number;
    slotsPerSheet: number;
    skippedForCorners: number;
  };
  /** Cutting and registration marks, from the margin the layout leaves. */
  marks?: PlanMarks;
  bookNUp?: { spreadsPerSheet: number; mixed: boolean };
}

export const COREL_BACKED_METHODS: ReadonlySet<ImpositionMethod> = new Set([
  "n-repeat",
  "gang-up",
  "book-brochure",
  "offset-book",
]);

export function hasDedicatedPlanner(method: ImpositionMethod) {
  return COREL_BACKED_METHODS.has(method);
}

export function planImposition(
  method: ImpositionMethod,
  settings: ImpositionSettings,
  source: SourceSummary,
): ImpositionPlan | null {
  const plan = planLayout(method, settings, source);
  if (plan && !plan.error) {
    plan.marks = buildMarks(plan, settings.cuttingMarks, settings.registrationMarks);
    for (const sheet of plan.sheets) {
      if (sheet.bookSpreads) {
        sheet.marks = buildMarks({ ...plan, sheets: [sheet] }, settings.cuttingMarks, settings.registrationMarks);
      }
    }
  }
  return plan;
}

function planLayout(
  method: ImpositionMethod,
  settings: ImpositionSettings,
  source: SourceSummary,
): ImpositionPlan | null {
  switch (method) {
    case "n-repeat":
    case "gang-up":
      return planGrid(method, settings, source);
    case "book-brochure":
      return planBook(settings, source);
    case "offset-book":
      return planOffset(settings, source);
    default:
      return null;
  }
}

function pageSizeMm(source: SourceSummary) {
  if (!source.pageSize) return null;
  return {
    width: pointsToMm(source.pageSize.width),
    height: pointsToMm(source.pageSize.height),
  };
}

function emptyPlan(settings: ImpositionSettings, error: string): ImpositionPlan {
  return {
    sheetWidthMm: settings.sheetWidthMm,
    sheetHeightMm: settings.sheetHeightMm,
    sheets: [],
    error,
    warnings: [],
    summary: error,
  };
}

// ---------------------------------------------------------------------------
// Step and repeat / gang-up
// ---------------------------------------------------------------------------

function calculateFit(sheet: number, item: number, spacing: number, margin: number) {
  const pitch = item + spacing;
  if (pitch <= 0) return 0;
  const usable = sheet - 2 * margin + spacing;
  if (usable <= 0) return 0;
  return Math.max(0, Math.floor(usable / pitch + 1e-9));
}

function overlaps(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
) {
  // Epsilon so an item merely touching a corner square is still allowed.
  const epsilon = 1e-6;
  return ax1 < bx2 - epsilon && ax2 > bx1 + epsilon && ay1 < by2 - epsilon && ay2 > by1 + epsilon;
}

/**
 * True when an item here would intrude into any of the four corner squares. A
 * rectangle test rather than "is this a corner cell", because with small items
 * several cells along each edge can reach into a corner square.
 */
function touchesCorner(
  x: number, y: number, w: number, h: number,
  sheetW: number, sheetH: number, corner: number,
) {
  const x2 = x + w;
  const y2 = y + h;
  return (
    overlaps(x, y, x2, y2, 0, 0, corner, corner) ||
    overlaps(x, y, x2, y2, sheetW - corner, 0, sheetW, corner) ||
    overlaps(x, y, x2, y2, 0, sheetH - corner, corner, sheetH) ||
    overlaps(x, y, x2, y2, sheetW - corner, sheetH - corner, sheetW, sheetH)
  );
}

interface GridSlots {
  columns: number;
  rows: number;
  skipped: number;
  slots: Array<{ x: number; y: number }>;
}

/**
 * The columns, rows and usable placements for an item of this size, with any
 * placement reaching into a corner keep-out square dropped. Shared by the grid
 * methods so they cannot drift apart.
 */
function buildGridSlots(
  settings: ImpositionSettings,
  itemW: number,
  itemH: number,
): GridSlots {
  const sheetW = settings.sheetWidthMm;
  const sheetH = settings.sheetHeightMm;
  const margin = settings.edgeMarginMm;
  const corner = settings.keepCornersClear ? settings.cornerClearanceMm : 0;

  const columns = calculateFit(sheetW, itemW, settings.horizontalSpacingMm, margin);
  const rows = calculateFit(sheetH, itemH, settings.verticalSpacingMm, margin);
  if (columns <= 0 || rows <= 0) return { columns, rows, skipped: 0, slots: [] };

  const blockW = columns * itemW + (columns - 1) * settings.horizontalSpacingMm;
  const blockH = rows * itemH + (rows - 1) * settings.verticalSpacingMm;

  // Centre the block in the sheet; any slack beyond the margin is shared evenly.
  const originX = settings.centerOnSheet ? (sheetW - blockW) / 2 : margin;
  const originY = settings.centerOnSheet ? (sheetH - blockH) / 2 : margin;

  const slots: Array<{ x: number; y: number }> = [];
  let skipped = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = originX + column * (itemW + settings.horizontalSpacingMm);
      const y = originY + row * (itemH + settings.verticalSpacingMm);
      if (corner > 0 && touchesCorner(x, y, itemW, itemH, sheetW, sheetH, corner)) {
        skipped += 1;
        continue;
      }
      slots.push({ x, y });
    }
  }

  return { columns, rows, skipped, slots };
}

function planGrid(
  method: "n-repeat" | "gang-up",
  settings: ImpositionSettings,
  source: SourceSummary,
): ImpositionPlan {
  const page = pageSizeMm(source);
  if (!page || source.pageCount === 0) {
    return emptyPlan(settings, "Upload and preflight a PDF to plan the sheet.");
  }

  // Step and repeat always takes the item size from the page it repeats; gang-up
  // lets the operator override it, which scales every page to the typed size.
  const itemW = method === "gang-up" ? settings.itemWidthMm ?? page.width : page.width;
  const itemH = method === "gang-up" ? settings.itemHeightMm ?? page.height : page.height;

  const sheetW = settings.sheetWidthMm;
  const sheetH = settings.sheetHeightMm;
  const margin = settings.edgeMarginMm;
  const corner = settings.keepCornersClear ? settings.cornerClearanceMm : 0;

  const plan: ImpositionPlan = {
    sheetWidthMm: sheetW,
    sheetHeightMm: sheetH,
    sheets: [],
    error: null,
    warnings: [],
    summary: "",
    marginMm: margin,
    cornerMm: corner,
    grid: { columns: 0, rows: 0, slotsPerSheet: 0, skippedForCorners: 0 },
  };

  if (itemW <= 0 || itemH <= 0) {
    plan.error = "The item size must be greater than zero.";
    plan.summary = plan.error;
    return plan;
  }

  const { columns, rows, skipped, slots } = buildGridSlots(settings, itemW, itemH);
  plan.grid = { columns, rows, slotsPerSheet: 0, skippedForCorners: 0 };

  if (columns <= 0 || rows <= 0) {
    plan.error = "Nothing fits on the sheet at this item size, margin and spacing.";
    plan.summary = plan.error;
    return plan;
  }

  plan.grid.slotsPerSheet = slots.length;
  plan.grid.skippedForCorners = skipped;

  if (slots.length === 0) {
    plan.error = "Every placement overlaps a corner square. Reduce the corner clearance or the item size.";
    plan.summary = plan.error;
    return plan;
  }

  const place = (slot: { x: number; y: number }, pageNumber: number | null): PlacedPage => ({
    page: pageNumber,
    x: slot.x,
    y: slot.y,
    width: itemW,
    height: itemH,
    rotated: false,
  });

  let fitText = `${columns} × ${rows} = ${slots.length} per sheet`;
  if (skipped > 0) fitText += ` (${skipped} dropped to keep the corners clear)`;

  if (method === "n-repeat") {
    const sourcePage = settings.repeatSourcePage;
    if (sourcePage < 1 || sourcePage > source.pageCount) {
      plan.error = `Page ${sourcePage} does not exist; the job has ${source.pageCount} page${source.pageCount === 1 ? "" : "s"}.`;
      plan.summary = plan.error;
      return plan;
    }
    plan.sheets = [{ label: "Sheet 1", slots: slots.map((slot) => place(slot, sourcePage)) }];
    plan.summary = `${fitText}. One full sheet of ${slots.length} copies of page ${sourcePage}.`;
    return plan;
  }

  const sheetCount = Math.ceil(source.pageCount / slots.length);
  for (let index = 0; index < sheetCount; index += 1) {
    plan.sheets.push({
      label: `Sheet ${index + 1}`,
      slots: slots.map((slot, slotIndex) => {
        const pageNumber = index * slots.length + slotIndex + 1;
        return place(slot, pageNumber <= source.pageCount ? pageNumber : null);
      }),
    });
  }
  plan.summary = `${fitText}. ${source.pageCount} page${source.pageCount === 1 ? "" : "s"} on ${sheetCount} sheet${sheetCount === 1 ? "" : "s"}, in page order.`;
  return plan;
}

// ---------------------------------------------------------------------------
// Book / Brochure (saddle-stitch printer spreads)
// ---------------------------------------------------------------------------

export function isSideBound(binding: BindingEdge) {
  return binding === "left" || binding === "right";
}

/** Two pages side by side for a side bind, stacked for a head or foot bind. */
export function bookSpreadSize(page: { width: number; height: number }, binding: BindingEdge) {
  return isSideBound(binding)
    ? { width: page.width * 2, height: page.height }
    : { width: page.width, height: page.height * 2 };
}

/**
 * A press sheet turned to suit the spread: landscape for a side-bound book,
 * portrait for a head- or foot-bound one. The sheet is still the same sheet.
 */
export function orientSheetForBook(widthMm: number, heightMm: number, binding: BindingEdge) {
  const long = Math.max(widthMm, heightMm);
  const short = Math.min(widthMm, heightMm);
  return isSideBound(binding) ? { width: long, height: short } : { width: short, height: long };
}

/**
 * How much a spread may overhang the sheet and still count as fitting. PDF page
 * sizes are stored in points and come back from conversion a few hundred-
 * thousandths of a millimetre off — an A4 page is 595.2756 pt, 210.00002 mm —
 * so an exact comparison rejects two A4 pages on an A3 sheet. Half a millimetre
 * is far below any press's registration and far above any rounding.
 */
const FIT_TOLERANCE_MM = 0.5;

/** Whether a sheet, turned to suit, can carry the spread. */
export function bookSheetFits(
  sheetWidthMm: number,
  sheetHeightMm: number,
  page: { width: number; height: number },
  binding: BindingEdge,
  allowTurn = false,
) {
  const spread = bookSpreadSize(page, binding);
  const sheet = orientSheetForBook(sheetWidthMm, sheetHeightMm, binding);
  if (allowTurn) return (spread.width <= sheet.width + 1e-6 && spread.height <= sheet.height + 1e-6) ||
    (spread.height <= sheet.width + 1e-6 && spread.width <= sheet.height + 1e-6);
  return spread.width <= sheet.width + FIT_TOLERANCE_MM && spread.height <= sheet.height + FIT_TOLERANCE_MM;
}

function planBook(settings: ImpositionSettings, source: SourceSummary): ImpositionPlan {
  const page = pageSizeMm(source);
  if (!page || source.pageCount === 0) {
    return emptyPlan(settings, "Upload and preflight a PDF to plan the spreads.");
  }

  const total = source.pageCount;
  const horizontal = isSideBound(settings.bindingEdge);
  const spread = bookSpreadSize(page, settings.bindingEdge);
  // With no sheet the output is exactly the spread; otherwise the chosen press
  // sheet, turned to suit the binding.
  const sheet = settings.noSheet
    ? { width: spread.width, height: spread.height }
    : orientSheetForBook(settings.sheetWidthMm, settings.sheetHeightMm, settings.bindingEdge);

  const plan: ImpositionPlan = {
    sheetWidthMm: sheet.width,
    sheetHeightMm: sheet.height,
    sheets: [],
    error: null,
    warnings: [],
    summary: "",
  };

  // Every sheet folds into four pages, so anything else leaves a sheet short.
  const blanks = (4 - (total % 4)) % 4;
  if (blanks !== 0) {
    plan.error = `Book / Brochure needs a page count that is a multiple of 4; the job has ${total}. Add ${blanks} blank page${blanks === 1 ? "" : "s"} to the end of the source to make ${total + blanks}.`;
    plan.summary = plan.error;
    return plan;
  }

  const nUp = settings.bookNUp && !settings.noSheet;
  const packed = nUp ? packBookSpreads(sheet.width, sheet.height, spread.width, spread.height, !!settings.bookMixMatch) : [];
  if (nUp ? packed.length === 0 : spread.width > sheet.width + FIT_TOLERANCE_MM || spread.height > sheet.height + FIT_TOLERANCE_MM) {
    plan.error = `A ${spread.width.toFixed(1)} × ${spread.height.toFixed(1)} mm spread does not fit on the ${sheet.width.toFixed(1)} × ${sheet.height.toFixed(1)} mm sheet. Choose a larger sheet.`;
    plan.summary = plan.error;
    return plan;
  }

  // The spread sits in the middle of the sheet; the fold and its trim edges
  // are the guides.
  const originX = (sheet.width - spread.width) / 2;
  const originY = (sheet.height - spread.height) / 2;
  if (!nUp) plan.guides = horizontal
    ? { x: [originX, originX + spread.width / 2, originX + spread.width], y: [originY, originY + spread.height] }
    : { x: [originX, originX + spread.width], y: [originY, originY + spread.height / 2, originY + spread.height] };

  const spreadCount = total / 2;
  for (let k = 1; k <= spreadCount; k += 1) {
    // Page k faces page N - k + 1: the outermost pair first, working inwards.
    const front = k;
    const back = total - k + 1;
    const place = (pageNumber: number) => {
      const slot = placeBookPage(pageNumber, spreadCount, settings.bindingEdge, page, spread.width, spread.height);
      return { ...slot, x: slot.x + originX, y: slot.y + originY };
    };
    if (!nUp) {
      plan.sheets.push({ label: `Spread ${k}`, slots: [place(front), place(back)] });
      continue;
    }
    const reverse = k % 2 === 0;
    const slots: PlacedPage[] = [];
    const regions: BookSpreadRegion[] = [];
    for (const position of packed) {
      // Reflect the whole spread on the reverse. The original page pairing
      // already reflects within each spread; quarter-turns reverse direction.
      const x = reverse && horizontal ? sheet.width - position.x - position.width : position.x;
      const y = reverse && !horizontal ? sheet.height - position.y - position.height : position.y;
      const turn = position.turned ? (reverse ? 270 : 90) : 0;
      regions.push({ x, y, width: position.width, height: position.height, foldAxis: horizontal !== position.turned ? "x" : "y" });
      for (const number of [front, back]) {
        const local = placeBookPage(number, spreadCount, settings.bindingEdge, page, spread.width, spread.height);
        // Head/foot-bound legacy spreads keep the early page in the same half.
        // Repeated duplex copies need the reverse half behind its front half.
        if (reverse && !horizontal) local.y = spread.height - local.y - local.height;
        const rotation = ((local.rotated ? 180 : 0) + turn) % 360 as 0 | 90 | 180 | 270;
        slots.push({
          ...local,
          x: x + (turn === 90 ? spread.height - local.y - local.height : turn === 270 ? local.y : local.x),
          y: y + (turn === 90 ? local.x : turn === 270 ? spread.width - local.x - local.width : local.y),
          width: position.turned ? local.height : local.width,
          height: position.turned ? local.width : local.height,
          rotation,
        });
      }
    }
    plan.sheets.push({ label: `Sheet ${Math.ceil(k / 2)} · ${reverse ? "Back" : "Front"}`, side: reverse ? "back" : "front", slots, bookSpreads: regions });
  }

  const sheets = total / 4;
  plan.summary = `${sheets} Sheet${sheets === 1 ? "" : "s"} Front-Back`;
  if (nUp) {
    plan.bookNUp = { spreadsPerSheet: packed.length, mixed: packed.some((p) => p.turned) && packed.some((p) => !p.turned) };
    plan.summary += ` · ${packed.length}-up${plan.bookNUp.mixed ? " Mix n Match" : ""} · ${packed.length} booklet cop${packed.length === 1 ? "y" : "ies"} per set`;
  }
  return plan;
}

/**
 * Where page `pageNumber` sits on its spread, following the Corel Book Maker
 * (BookMakerForm.frm / BookMakerViewModel.cs). Left bind puts odd pages on the
 * right half, mirrored for a right bind, nothing turned.
 *
 * Top and bottom binds stack the two pages and key rotation on the parity of
 * the source page number — first-half pages turn when even, second-half pages
 * when odd — so both pages of every second spread are turned and neither on
 * the others. On top of that, the shop turns one page on the cover spread
 * (the first page of the generated PDF) that the add-on leaves upright: the
 * last page for a top bind, the first page for a bottom bind. Everything else
 * is verified against a model of the Corel code for N = 4…20.
 */
function placeBookPage(
  pageNumber: number,
  spreadCount: number,
  binding: BindingEdge,
  page: { width: number; height: number },
  spreadW: number,
  spreadH: number,
): PlacedPage {
  const cx = spreadW / 2;
  const cy = spreadH / 2;
  const isFirstHalf = pageNumber <= spreadCount;
  const odd = pageNumber % 2 === 1;

  switch (binding) {
    case "left": {
      const onRight = odd;
      return { page: pageNumber, x: onRight ? cx : cx - page.width, y: 0, width: page.width, height: page.height, rotated: false };
    }
    case "right": {
      const onRight = !odd;
      return { page: pageNumber, x: onRight ? cx : cx - page.width, y: 0, width: page.width, height: page.height, rotated: false };
    }
    case "top": {
      // Earlier page below the fold (Corel: TopY = CenterY), later page above it.
      // Parity rule, except the last page — upper half of the cover spread — always turns.
      const y = isFirstHalf ? cy : cy - page.height;
      const rotated = pageNumber === spreadCount * 2 ? true : isFirstHalf ? !odd : odd;
      return { page: pageNumber, x: 0, y, width: page.width, height: page.height, rotated };
    }
    case "bottom": {
      // Earlier page above the fold, later page below it.
      // Parity rule, except page 1 — upper half of the cover spread — always turns.
      const y = isFirstHalf ? cy - page.height : cy;
      const rotated = pageNumber === 1 ? true : isFirstHalf ? !odd : odd;
      return { page: pageNumber, x: 0, y, width: page.width, height: page.height, rotated };
    }
  }
}

// ---------------------------------------------------------------------------
// Offset Book (press signatures)
// ---------------------------------------------------------------------------

interface SlotDef {
  col: number;
  row: number;
  /** Position within the signature's page run (1..pagesPerSheet). */
  logical: number;
  rotated: boolean;
}

/**
 * The fixed slot maps from the Corel Offset Book tool. Row 0 is the head-to-head
 * top row (pages turned 180°), row 1 the upright bottom row. A single sheet folds
 * into one signature; the top row folds down onto the bottom row, then the columns
 * fold in at the spines.
 */
const PLATE_MAPS: Record<PlateSetting, Record<SheetSide, SlotDef[]>> = {
  "4-page": {
    front: [
      { col: 0, row: 0, logical: 5, rotated: true },
      { col: 1, row: 0, logical: 4, rotated: true },
      { col: 0, row: 1, logical: 8, rotated: false },
      { col: 1, row: 1, logical: 1, rotated: false },
    ],
    back: [
      { col: 0, row: 0, logical: 3, rotated: true },
      { col: 1, row: 0, logical: 6, rotated: true },
      { col: 0, row: 1, logical: 2, rotated: false },
      { col: 1, row: 1, logical: 7, rotated: false },
    ],
  },
  "8-page": {
    front: [
      { col: 0, row: 0, logical: 5, rotated: true },
      { col: 1, row: 0, logical: 12, rotated: true },
      { col: 2, row: 0, logical: 9, rotated: true },
      { col: 3, row: 0, logical: 8, rotated: true },
      { col: 0, row: 1, logical: 4, rotated: false },
      { col: 1, row: 1, logical: 13, rotated: false },
      { col: 2, row: 1, logical: 16, rotated: false },
      { col: 3, row: 1, logical: 1, rotated: false },
    ],
    back: [
      { col: 0, row: 0, logical: 7, rotated: true },
      { col: 1, row: 0, logical: 10, rotated: true },
      { col: 2, row: 0, logical: 11, rotated: true },
      { col: 3, row: 0, logical: 6, rotated: true },
      { col: 0, row: 1, logical: 2, rotated: false },
      { col: 1, row: 1, logical: 15, rotated: false },
      { col: 2, row: 1, logical: 14, rotated: false },
      { col: 3, row: 1, logical: 3, rotated: false },
    ],
  },
};

/** Physical sheets in the plan: a front/back pair is one sheet, as is a Lot-Pot. */
export function physicalSheetCount(plan: ImpositionPlan) {
  return plan.sheets.filter((sheet) => sheet.side !== "back").length;
}

export function pagesPerSheet(plate: PlateSetting) {
  return plate === "4-page" ? 8 : 16;
}

function planOffset(settings: ImpositionSettings, source: SourceSummary): ImpositionPlan {
  const page = pageSizeMm(source);
  if (!page || source.pageCount === 0) {
    return emptyPlan(settings, "Upload and preflight a PDF to plan the signatures.");
  }

  const total = source.pageCount;
  const perSheet = pagesPerSheet(settings.plateSetting);
  const half = perSheet / 2;
  // Imposed straight onto the plate, the plate is the output page; the
  // signature is centred on it exactly as it would be on a sheet.
  const onPlate = settings.offsetOutput === "plate";
  const sheetW = onPlate ? settings.plateWidthMm : settings.sheetWidthMm;
  const sheetH = onPlate ? settings.plateHeightMm : settings.sheetHeightMm;
  const surface = onPlate ? "plate" : "sheet";
  const gutter = settings.offsetGutterMm;

  const plan: ImpositionPlan = {
    sheetWidthMm: sheetW,
    sheetHeightMm: sheetH,
    onPlate,
    sheets: [],
    error: null,
    warnings: [],
    summary: "",
  };

  // The 4-page plate takes any multiple of 4: a job that leaves 4 pages over
  // after its full sheets prints those 4 as a Lot-Pot.
  const fourPage = settings.plateSetting === "4-page";
  if (fourPage && total % 4 !== 0) {
    const blanks = 4 - (total % 4);
    plan.error = `Offset Book needs a page count that is a multiple of 4; the job has ${total}. Add ${blanks} blank page${blanks === 1 ? "" : "s"} to make ${total + blanks}.`;
    plan.summary = plan.error;
    return plan;
  }

  if (!fourPage && settings.centerPin && total % perSheet !== 0) {
    plan.error = `Center pin needs a page count that is a multiple of ${perSheet}; the job has ${total}. Add ${perSheet - (total % perSheet)} blank page${perSheet - (total % perSheet) === 1 ? "" : "s"}.`;
    plan.summary = plan.error;
    return plan;
  }

  if (!fourPage && !settings.centerPin && total % perSheet !== 0) {
    plan.warnings.push(
      `${total} is not a multiple of ${perSheet}: the last signature has ${perSheet - (total % perSheet)} empty slot${perSheet - (total % perSheet) === 1 ? "" : "s"}.`,
    );
  }

  // The signature block, in its own coordinates from its top-left corner.
  // Spines abut; the gutter separates the two rows and, on the 8-page plate,
  // the two inner columns.
  const localX =
    settings.plateSetting === "4-page"
      ? [0, page.width]
      : [0, page.width, 2 * page.width + gutter, 3 * page.width + gutter];
  const localY = [0, page.height + gutter];
  const blockW = localX.length * page.width + (settings.plateSetting === "8-page" ? gutter : 0);
  const blockH = 2 * page.height + gutter;
  // Spines (where columns meet) and the head-to-head centre line, in block coordinates.
  const localFolds = {
    x: settings.plateSetting === "4-page" ? [page.width] : [page.width, 2 * page.width + gutter / 2, 3 * page.width + gutter],
    y: [page.height + gutter / 2],
  };

  // Where the blocks go: one centred block, as the Corel tool does, or with
  // N-up as many as fit, packed like Book / Brochure spreads.
  const nUp = settings.bookNUp;
  const centred: PackedSpread[] = [
    { x: (sheetW - blockW) / 2, y: (sheetH - blockH) / 2, width: blockW, height: blockH, turned: false },
  ];
  const packed = nUp ? packBookSpreads(sheetW, sheetH, blockW, blockH, !!settings.bookMixMatch) : centred;

  if (nUp && packed.length === 0) {
    plan.error = `A ${blockW.toFixed(1)} × ${blockH.toFixed(1)} mm signature does not fit on the ${sheetW.toFixed(1)} × ${sheetH.toFixed(1)} mm ${surface}. Choose a larger ${surface}.`;
    plan.summary = plan.error;
    return plan;
  }
  if (!nUp && (blockW > sheetW + 1e-6 || blockH > sheetH + 1e-6)) {
    plan.warnings.push(
      `The ${perSheet}-page signature (${blockW.toFixed(1)} × ${blockH.toFixed(1)} mm) is larger than the ${sheetW.toFixed(1)} × ${sheetH.toFixed(1)} mm ${surface}.`,
    );
  }

  // A Lot-Pot prints both sides from one plate by tumbling the sheet head to
  // foot, so its copies stay upright in a grid centred top to bottom: each copy
  // then backs onto an identical one.
  const lotPotColumns = Math.floor((sheetW + 1e-6) / blockW);
  const lotPotRows = Math.floor((sheetH + 1e-6) / blockH);
  const lotPotPacked: PackedSpread[] = nUp
    ? Array.from({ length: lotPotColumns * lotPotRows }, (_, index) => ({
        x: (sheetW - lotPotColumns * blockW) / 2 + (index % lotPotColumns) * blockW,
        y: (sheetH - lotPotRows * blockH) / 2 + Math.floor(index / lotPotColumns) * blockH,
        width: blockW,
        height: blockH,
        turned: false,
      }))
    : centred;

  if (nUp) {
    plan.bookNUp = {
      spreadsPerSheet: packed.length,
      mixed: packed.some((p) => p.turned) && packed.some((p) => !p.turned),
    };
  } else {
    // A single block keeps its folds as sheet-wide guides.
    plan.guides = {
      x: localFolds.x.map((x) => centred[0].x + x),
      y: localFolds.y.map((y) => centred[0].y + y),
    };
  }

  interface LocalSlot {
    col: number;
    row: number;
    rotated: boolean;
    page: number | null;
  }

  /**
   * Puts one plate's slots on the sheet. With N-up, the back of a sheet is its
   * front mirrored left to right (the flip the plate maps are drawn for), and a
   * quarter-turned block turns the other way on the back: 270° for 90°.
   */
  const layOut = (locals: LocalSlot[], positions: PackedSpread[], back: boolean) => {
    const slots: PlacedPage[] = [];
    const regions: BookSpreadRegion[] = [];
    for (const position of positions) {
      const x0 = back ? sheetW - position.x - position.width : position.x;
      const y0 = position.y;
      const turn = position.turned ? (back ? 270 : 90) : 0;
      for (const local of locals) {
        const lx = localX[local.col];
        const ly = localY[local.row];
        const lw = page.width;
        const lh = page.height;
        const slot: PlacedPage = {
          page: local.page !== null && local.page <= total ? local.page : null,
          x: x0 + (turn === 90 ? blockH - ly - lh : turn === 270 ? ly : lx),
          y: y0 + (turn === 90 ? lx : turn === 270 ? blockW - lx - lw : ly),
          width: position.turned ? lh : lw,
          height: position.turned ? lw : lh,
          rotated: local.rotated,
        };
        if (nUp) slot.rotation = (((local.rotated ? 180 : 0) + turn) % 360) as 0 | 90 | 180 | 270;
        slots.push(slot);
      }
      if (nUp) {
        // The block's own folds, carried through the same turn.
        const folds =
          turn === 90
            ? { x: localFolds.y.map((y) => x0 + blockH - y), y: localFolds.x.map((x) => y0 + x) }
            : turn === 270
              ? { x: localFolds.y.map((y) => x0 + y), y: localFolds.x.map((x) => y0 + blockW - x) }
              : { x: localFolds.x.map((x) => x0 + x), y: localFolds.y.map((y) => y0 + y) };
        regions.push({ x: x0, y: y0, width: position.width, height: position.height, foldAxis: "x", folds });
      }
    }
    return { slots, bookSpreads: nUp ? regions : undefined };
  };

  const maps = PLATE_MAPS[settings.plateSetting];

  /** A front and back pair, with `pageFor` giving the job page for each logical slot. */
  const pushSignature = (sheetNumber: number, pageFor: (logical: number) => number) => {
    (["front", "back"] as SheetSide[]).forEach((side) => {
      const locals = maps[side].map((slot) => ({ col: slot.col, row: slot.row, rotated: slot.rotated, page: pageFor(slot.logical) }));
      plan.sheets.push({
        label: `Sheet ${sheetNumber} · ${side === "front" ? "Front" : "Back"}`,
        side,
        ...layOut(locals, packed, side === "back"),
      });
    });
  };

  /**
   * Four pages on one plate that prints both sides of the sheet, which is then
   * cut in two. The outside pair (last | first) is upright; the inside pair
   * (last − 1 | first + 1) is turned head to head above it.
   */
  const pushLotPot = (sheetNumber: number, first: number, last: number) => {
    const locals: LocalSlot[] = [
      { col: 0, row: 0, rotated: true, page: last - 1 },
      { col: 1, row: 0, rotated: true, page: first + 1 },
      { col: 0, row: 1, rotated: false, page: last },
      { col: 1, row: 1, rotated: false, page: first },
    ];
    plan.sheets.push({
      label: `Sheet ${sheetNumber} · Lot-Pot`,
      lotPot: true,
      ...layOut(locals, lotPotPacked, false),
    });
  };

  // Stacked signatures take pages in runs of a full sheet.
  const stacked = (sheetIndex: number, logical: number) => (sheetIndex - 1) * perSheet + logical;
  // Center pin nests them: sheet i carries the i-th run of `half` pages from the
  // front of the block and the i-th from the back, working inwards.
  const nested = (sheetIndex: number, logical: number, count: number, offset = 0) =>
    offset +
    (logical <= half
      ? (sheetIndex - 1) * half + logical
      : count - sheetIndex * half + (logical - half));

  const fullSheets = Math.floor(total / perSheet);
  const lotPot = fourPage && total % perSheet === 4;
  let lotPotPages = "";

  if (lotPot && nUp && lotPotPacked.length === 0) {
    plan.error = `The Lot-Pot has to print upright for its back to line up, and a ${blockW.toFixed(1)} × ${blockH.toFixed(1)} mm signature does not fit upright on the ${sheetW.toFixed(1)} × ${sheetH.toFixed(1)} mm ${surface}. Turn the ${surface} or choose a larger one.`;
    plan.summary = plan.error;
    return plan;
  }

  if (!lotPot) {
    const sheetCount = Math.ceil(total / perSheet);
    for (let i = 1; i <= sheetCount; i += 1) {
      pushSignature(i, (logical) => (settings.centerPin ? nested(i, logical, total) : stacked(i, logical)));
    }
  } else if (!settings.centerPin) {
    // Normal bind: full sheets in page order, then the last 4 pages as the Lot-Pot.
    for (let i = 1; i <= fullSheets; i += 1) pushSignature(i, (logical) => stacked(i, logical));
    pushLotPot(fullSheets + 1, total - 3, total);
    lotPotPages = `${total - 3}–${total}`;
  } else if (settings.lotPotPosition === "inner") {
    // The outer sheets nest as usual; the innermost 4 pages are the Lot-Pot.
    for (let i = 1; i <= fullSheets; i += 1) pushSignature(i, (logical) => nested(i, logical, total));
    const first = fullSheets * half + 1;
    pushLotPot(fullSheets + 1, first, first + 3);
    lotPotPages = `${first}–${first + 3}`;
  } else {
    // Title: pages 1, 2 and the last two form the Lot-Pot, printed first; the
    // pages between them (3 to N − 2) nest inside it.
    pushLotPot(1, 1, total);
    for (let i = 1; i <= fullSheets; i += 1) pushSignature(i + 1, (logical) => nested(i, logical, total - 4, 2));
    lotPotPages = `1, 2, ${total - 1}, ${total}`;
  }

  const binding = settings.centerPin ? "nested for center-pin (saddle) stitching" : "stacked in page order";
  const sheetsText = lotPot
    ? `${fullSheets} sheet${fullSheets === 1 ? "" : "s"} front and back + 1 Lot-Pot (pages ${lotPotPages})`
    : `${Math.ceil(total / perSheet)} sheet${Math.ceil(total / perSheet) === 1 ? "" : "s"} of ${perSheet} pages (${half} per side)`;
  plan.summary = `${total} pages → ${sheetsText}, ${binding}${onPlate ? ", imposed on the plate" : ""}.`;
  if (nUp) {
    plan.summary += ` ${packed.length}-up${plan.bookNUp?.mixed ? " Mix n Match" : ""}: ${packed.length} cop${packed.length === 1 ? "y" : "ies"} of each signature per sheet`;
    plan.summary += lotPot ? `; the Lot-Pot is ${lotPotPacked.length}-up.` : ".";
  }
  return plan;
}
