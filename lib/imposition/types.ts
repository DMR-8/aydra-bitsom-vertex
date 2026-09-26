export type ImpositionMethod =
  | "book-brochure"
  | "offset-book"
  | "n-up"
  | "gang-up"
  | "n-repeat"
  | "sticker-cutting"
  | "box-cut-crease";

export type WorkflowStep = 1 | 2 | 3 | 4 | 5;

export interface PageSize {
  width: number;
  height: number;
}

export interface ImpositionRequirement {
  title: string;
  description: string;
}

export interface MethodOption {
  id: ImpositionMethod;
  title: string;
  description: string;
}

export type Unit = "mm" | "in";

/**
 * Which cutting marks to draw. "auto" takes the best the margin allows — outer,
 * then inner, then none — and is the default; the others are the operator's
 * explicit choice, still capped by what fits.
 */
export type CuttingMarks = "auto" | "none" | "inner" | "outer";

/** A cutting-marks choice once the margin has been applied. */
export type EffectiveCuttingMarks = Exclude<CuttingMarks, "auto">;

/** Which edge a Book / Brochure spread is bound on. */
export type BindingEdge = "left" | "right" | "top" | "bottom";

/** Pages per plate (per sheet side) for Offset Book signatures. */
export type PlateSetting = "4-page" | "8-page";

/** Where a Center Pin Offset Book puts its 4-page Lot-Pot. */
export type LotPotPosition = "title" | "inner";

/** What an Offset Book is imposed onto: a press sheet, or the plate itself. */
export type OffsetOutput = "sheet" | "plate";

/**
 * Every length is held in millimetres whatever unit the panel is showing, so the
 * unit toggle can never reinterpret a stored 6 mm margin as 6 inches.
 */
export interface ImpositionSettings {
  // Generic grid (N-Up, Sticker Cutting, Box Cut + Crease)
  sheetSize: string;
  rows: number;
  columns: number;
  gutter: number;
  margins: number;
  copies: number;
  duplex: boolean;
  registrationMarks: boolean;
  cuttingMarks: CuttingMarks;
  outputName: string;

  // Shared by the Corel-derived methods
  unit: Unit;
  sheetWidthMm: number;
  sheetHeightMm: number;

  // N-Repeat (step and repeat) and Gang Up
  /** Page of the source job that N-Repeat repeats across the sheet. */
  repeatSourcePage: number;
  /** Gang Up item size override; null means "use the PDF page size". */
  itemWidthMm: number | null;
  itemHeightMm: number | null;
  horizontalSpacingMm: number;
  verticalSpacingMm: number;
  edgeMarginMm: number;
  keepCornersClear: boolean;
  cornerClearanceMm: number;
  centerOnSheet: boolean;

  // Book / Brochure
  bindingEdge: BindingEdge;
  /** Output at the spread's own size, with no press sheet around it. */
  noSheet: boolean;
  /**
   * Repeat complete printer spreads (or, for Offset Book, whole signatures) at
   * actual size across the press sheet.
   */
  bookNUp: boolean;
  /** Allow upright and quarter-turned spreads or signatures on the same sheet. */
  bookMixMatch: boolean;

  // Offset Book
  plateSetting: PlateSetting;
  centerPin: boolean;
  /** Head-to-head gap between the two rows of a signature. */
  offsetGutterMm: number;
  /** Only used when a Center Pin job leaves 4 pages over. */
  lotPotPosition: LotPotPosition;
  offsetOutput: OffsetOutput;
  plateWidthMm: number;
  plateHeightMm: number;
}

/** What preflight found in the uploaded file, as the planners need it. */
export interface SourceSummary {
  pageCount: number;
  /** First page's visible size, in PDF points (1/72 in). */
  pageSize: PageSize | null;
}
