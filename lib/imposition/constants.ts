import type { ImpositionMethod, ImpositionSettings, MethodOption } from "./types";

export const methodOptions: MethodOption[] = [
  {
    id: "book-brochure",
    title: "Book / Brochure",
    description: "Saddle-stitch printer spreads bound left, right, top or bottom. Page 1 pairs with the last page. Needs a multiple of 4 pages (8, 12, 16…).",
  },
  {
    id: "offset-book",
    title: "Offset Book",
    description: "4-page or 8-page plate signatures for offset presses, nested (center pin) or stacked. A 4-page plate job that leaves 4 pages over prints them as a Lot-Pot.",
  },
  {
    id: "n-up",
    title: "N-Up",
    description: "Place multiple pages on a sheet in reading order.",
  },
  {
    id: "gang-up",
    title: "Gang Up",
    description: "Place every page once, in order, overflowing onto new sheets.",
  },
  {
    id: "n-repeat",
    title: "N-Repeat",
    description: "Step and repeat one page to fill a full press sheet.",
  },
  {
    id: "sticker-cutting",
    title: "Sticker Cutting",
    description: "Arrange labels with spacing and cutter-friendly output marks.",
  },
  {
    id: "box-cut-crease",
    title: "Box Cut + Crease",
    description: "Prepare packaging layouts with cut and crease separation.",
  },
];

export const impositionRequirements = {
  "book-brochure": [
    {
      title: "Page order",
      description:
        "Page 1 should be the outer title/cover and page 2 the inner title/cover.",
    },
    {
      title: "Page count",
      description: "Final page count should be divisible by four; blanks may be inserted later.",
    },
  ],
  "offset-book": [
    {
      title: "Opening pages",
      description: "Confirm title, title inner, copyright and content pages are in reading order.",
    },
    {
      title: "Binding allowance",
      description: "Allow for signature size, creep and the selected binding method.",
    },
  ],
  "n-up": [
    {
      title: "Mixed page sizes",
      description: "All pages should normally share the same trim size and orientation.",
    },
  ],
  "gang-up": [
    {
      title: "Artwork boundaries",
      description: "Each supplied page should represent one complete item with final bleed.",
    },
  ],
  "n-repeat": [
    {
      title: "Source artwork",
      description: "Use a single finished page to repeat across the selected press sheet.",
    },
  ],
  "sticker-cutting": [
    {
      title: "Cut path",
      description: "Artwork should include, or later be paired with, a valid vector cutting path.",
    },
  ],
  "box-cut-crease": [
    {
      title: "Technical separations",
      description: "Cut and crease paths must remain distinguishable from printable artwork.",
    },
  ],
} satisfies Record<import("./types").ImpositionMethod, import("./types").ImpositionRequirement[]>;

export const sheetSizes = [
  "A4 (210 x 297 mm)",
  "A3 (297 x 420 mm)",
  "SRA3 (320 x 450 mm)",
  "Letter (216 x 279 mm)",
  "Tabloid (279 x 432 mm)",
];

/**
 * Press sheets for the Corel-derived methods, held in millimetres so a preset applies
 * identically whichever unit the panel is showing. Same list and order as the
 * CorelDRAW add-on: the two most-used shop sheets first, then smallest to largest.
 */
export interface SheetPreset {
  name: string;
  widthMm: number;
  heightMm: number;
}

export const sheetPresets: SheetPreset[] = [
  { name: "13 x 19 in", widthMm: 330.2, heightMm: 482.6 },
  { name: "Tabloid Extra (12 x 18 in)", widthMm: 304.8, heightMm: 457.2 },
  { name: "Letter (8.5 x 11 in)", widthMm: 215.9, heightMm: 279.4 },
  { name: "A4", widthMm: 210, heightMm: 297 },
  { name: "Legal (8.5 x 14 in)", widthMm: 215.9, heightMm: 355.6 },
  { name: "A3", widthMm: 297, heightMm: 420 },
  { name: "SRA3", widthMm: 320, heightMm: 450 },
  { name: "18 x 23 in", widthMm: 457.2, heightMm: 584.2 },
  { name: "19 x 25 in", widthMm: 482.6, heightMm: 635 },
  { name: "20 x 30 in", widthMm: 508, heightMm: 762 },
  { name: "23 x 36 in", widthMm: 584.2, heightMm: 914.4 },
];

/**
 * Offset press plates, for imposing an Offset Book straight onto the plate
 * rather than onto a sheet. Dominant is the shop's default press, so it leads.
 */
export const platePresets: SheetPreset[] = [
  { name: "Dominant", widthMm: 530, heightMm: 664 },
  { name: "Heidelberg S74", widthMm: 605, heightMm: 745 },
  { name: "Heidelberg S72", widthMm: 615, heightMm: 724 },
  { name: "Lithrone G37", widthMm: 700, heightMm: 945 },
  { name: "Lithrone L440", widthMm: 800, heightMm: 665 },
  { name: "Lithrone G26", widthMm: 560, heightMm: 670 },
];

export const defaultSettings: ImpositionSettings = {
  sheetSize: sheetSizes[0],
  rows: 2,
  columns: 2,
  gutter: 5,
  margins: 10,
  copies: 1,
  duplex: false,
  registrationMarks: false,
  cuttingMarks: "auto",
  outputName: "imposed-output.pdf",

  unit: "in",
  sheetWidthMm: 304.8, // Tabloid Extra, portrait
  sheetHeightMm: 457.2,

  repeatSourcePage: 1,
  itemWidthMm: null,
  itemHeightMm: null,
  // House press rules from the Corel add-on: 2 mm gaps, 6 mm edge band, 10 mm corners.
  horizontalSpacingMm: 2,
  verticalSpacingMm: 2,
  edgeMarginMm: 6,
  keepCornersClear: true,
  cornerClearanceMm: 10,
  centerOnSheet: true,

  bindingEdge: "left",
  noSheet: false,
  bookNUp: false,
  bookMixMatch: false,

  plateSetting: "4-page",
  centerPin: true,
  lotPotPosition: "title",
  offsetGutterMm: 7.62, // 0.3 in
  offsetOutput: "sheet",
  plateWidthMm: platePresets[0].widthMm,
  plateHeightMm: platePresets[0].heightMm,
};

/**
 * Starting settings for a freshly chosen method. Offset Book is the one method whose
 * Corel tool ships a different sheet (18 x 23 in); everything else starts from the
 * shared defaults.
 */
export function defaultSettingsFor(method: ImpositionMethod): ImpositionSettings {
  if (method === "offset-book") {
    return { ...defaultSettings, sheetWidthMm: 457.2, sheetHeightMm: 584.2 };
  }
  return { ...defaultSettings };
}
