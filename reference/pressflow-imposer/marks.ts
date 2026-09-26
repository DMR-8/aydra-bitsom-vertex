import type { ImpositionPlan } from "./layout";
import type { CuttingMarks, EffectiveCuttingMarks } from "./types";

/**
 * Cutting and registration marks, worked out from where the imposed content
 * sits on the sheet. Everything is in millimetres in the plan's coordinate
 * space (top-left origin, y down); the preview and the PDF writer both draw
 * from the same segments so they cannot disagree.
 */

export type { CuttingMarks, EffectiveCuttingMarks };

/** Outer marks sit in the margin, so they need room; inner marks sit on the trim. */
export const OUTER_MARKS_MIN_MARGIN_MM = 10;
export const INNER_MARKS_MIN_MARGIN_MM = 5;
export const REGISTRATION_MIN_MARGIN_MM = 8;

/** Outer crop marks: a gap off the trim, then a short line. 3 + 6 fits inside 10. */
const OUTER_GAP_MM = 3;
const OUTER_LENGTH_MM = 6;
/** Inner marks: an L along the trim edges, drawn inward from each corner. */
const INNER_LENGTH_MM = 6;
/** Registration target: a circle with a cross through it, centred in the margin. */
const REGISTRATION_RADIUS_MM = 2.5;

export interface MarkLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "cut-outer" | "cut-inner" | "fold" | "registration";
}

export interface MarkCircle {
  cx: number;
  cy: number;
  r: number;
  kind: "registration";
}

export interface MarksAllowance {
  /** Smallest distance from the imposed content to any sheet edge. */
  marginMm: number;
  outer: boolean;
  inner: boolean;
  registration: boolean;
}

export interface PlanMarks {
  allowance: MarksAllowance;
  cutting: EffectiveCuttingMarks;
  registration: boolean;
  lines: MarkLine[];
  circles: MarkCircle[];
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The rectangle the placements occupy, across every sheet of the plan. */
export function contentBounds(plan: ImpositionPlan): Bounds | null {
  let bounds: Bounds | null = null;
  for (const sheet of plan.sheets) {
    for (const slot of sheet.slots) {
      const box = { left: slot.x, top: slot.y, right: slot.x + slot.width, bottom: slot.y + slot.height };
      bounds = bounds
        ? {
            left: Math.min(bounds.left, box.left),
            top: Math.min(bounds.top, box.top),
            right: Math.max(bounds.right, box.right),
            bottom: Math.max(bounds.bottom, box.bottom),
          }
        : box;
    }
  }
  return bounds;
}

// A hair of slack so a margin of 9.9999 mm from point rounding still counts as 10.
const TOLERANCE_MM = 0.05;

export function marksAllowance(plan: ImpositionPlan): MarksAllowance {
  const bounds = contentBounds(plan);
  if (!bounds) return { marginMm: 0, outer: false, inner: false, registration: false };

  const marginMm = Math.max(
    0,
    Math.min(bounds.left, bounds.top, plan.sheetWidthMm - bounds.right, plan.sheetHeightMm - bounds.bottom),
  );

  return {
    marginMm,
    outer: marginMm + TOLERANCE_MM >= OUTER_MARKS_MIN_MARGIN_MM,
    inner: marginMm + TOLERANCE_MM >= INNER_MARKS_MIN_MARGIN_MM,
    registration: marginMm + TOLERANCE_MM >= REGISTRATION_MIN_MARGIN_MM,
  };
}

/** Fold positions: guide lines strictly inside the content, not its edges. */
function interiorGuides(plan: ImpositionPlan, bounds: Bounds) {
  const inside = (value: number, low: number, high: number) => value > low + TOLERANCE_MM && value < high - TOLERANCE_MM;
  return {
    x: (plan.guides?.x ?? []).filter((x) => inside(x, bounds.left, bounds.right)),
    y: (plan.guides?.y ?? []).filter((y) => inside(y, bounds.top, bounds.bottom)),
  };
}

/**
 * The marks that will actually be drawn for a choice. Outer wants the most
 * room, so "auto" and an explicit "outer" both fall back through inner to none
 * as the margin shrinks; an explicit "inner" only falls to none.
 */
export function resolveCuttingMarks(cutting: CuttingMarks, allowance: MarksAllowance): EffectiveCuttingMarks {
  if (cutting === "none") return "none";
  if (cutting === "inner") return allowance.inner ? "inner" : "none";
  if (allowance.outer) return "outer";
  return allowance.inner ? "inner" : "none";
}

export function buildMarks(plan: ImpositionPlan, cutting: CuttingMarks, registration: boolean): PlanMarks {
  const regions = plan.sheets[0]?.bookSpreads;
  if (regions?.length) {
    // Registration targets use the whole block; cut/fold ticks belong to each
    // individual spread. Never extend an outer tick into a neighbouring copy.
    const plain = { ...plan, sheets: plan.sheets.map((sheet) => ({ ...sheet, bookSpreads: undefined })) };
    const result = buildMarks(plain, "none", registration);
    result.cutting = resolveCuttingMarks(cutting, result.allowance);
    for (const region of regions) {
      const regionPlan: ImpositionPlan = {
        ...plain,
        sheets: [{ label: "Spread", slots: [{ ...region, page: null, rotated: false }] }],
        guides: region.folds ?? (region.foldAxis === "x"
          ? { x: [region.x + region.width / 2], y: [] }
          : { x: [], y: [region.y + region.height / 2] }),
      };
      const marks = buildMarks(regionPlan, result.cutting, false);
      result.lines.push(...marks.lines.filter((line) => result.cutting !== "outer" || !regions.some((other) => {
        if (other === region) return false;
        const minX = Math.min(line.x1, line.x2);
        const maxX = Math.max(line.x1, line.x2);
        const minY = Math.min(line.y1, line.y2);
        const maxY = Math.max(line.y1, line.y2);
        return maxX >= other.x - 1e-6 && minX <= other.x + other.width + 1e-6 &&
          maxY >= other.y - 1e-6 && minY <= other.y + other.height + 1e-6;
      })));
    }
    result.lines = result.lines.filter((line, index, lines) => lines.findIndex((other) =>
      other.kind === line.kind && Math.abs(other.x1 - line.x1) < 1e-6 && Math.abs(other.x2 - line.x2) < 1e-6 &&
      Math.abs(other.y1 - line.y1) < 1e-6 && Math.abs(other.y2 - line.y2) < 1e-6) === index);
    return result;
  }
  const allowance = marksAllowance(plan);
  const bounds = contentBounds(plan);
  const lines: MarkLine[] = [];
  const circles: MarkCircle[] = [];

  const effectiveCutting = resolveCuttingMarks(cutting, allowance);
  const effectiveRegistration = registration && allowance.registration;

  if (bounds && effectiveCutting === "outer") {
    const { left, top, right, bottom } = bounds;
    const g = OUTER_GAP_MM;
    const l = OUTER_LENGTH_MM;
    const line = (x1: number, y1: number, x2: number, y2: number, kind: MarkLine["kind"] = "cut-outer") =>
      lines.push({ x1, y1, x2, y2, kind });

    // Trim lines extended past each corner, outside the content.
    line(left - g - l, top, left - g, top);
    line(right + g, top, right + g + l, top);
    line(left - g - l, bottom, left - g, bottom);
    line(right + g, bottom, right + g + l, bottom);
    line(left, top - g - l, left, top - g);
    line(left, bottom + g, left, bottom + g + l);
    line(right, top - g - l, right, top - g);
    line(right, bottom + g, right, bottom + g + l);

    // Fold ticks in the margin, in line with each fold.
    const folds = interiorGuides(plan, bounds);
    for (const x of folds.x) {
      line(x, top - g - l, x, top - g, "fold");
      line(x, bottom + g, x, bottom + g + l, "fold");
    }
    for (const y of folds.y) {
      line(left - g - l, y, left - g, y, "fold");
      line(right + g, y, right + g + l, y, "fold");
    }
  }

  if (bounds && effectiveCutting === "inner") {
    const { left, top, right, bottom } = bounds;
    const l = INNER_LENGTH_MM;
    const line = (x1: number, y1: number, x2: number, y2: number, kind: MarkLine["kind"] = "cut-inner") =>
      lines.push({ x1, y1, x2, y2, kind });

    // An L in each corner, along the trim edges, pointing inward.
    line(left, top, left + l, top);
    line(left, top, left, top + l);
    line(right - l, top, right, top);
    line(right, top, right, top + l);
    line(left, bottom - l, left, bottom);
    line(left, bottom, left + l, bottom);
    line(right, bottom - l, right, bottom);
    line(right - l, bottom, right, bottom);

    // Fold ticks just inside the trim.
    const folds = interiorGuides(plan, bounds);
    for (const x of folds.x) {
      line(x, top, x, top + l, "fold");
      line(x, bottom - l, x, bottom, "fold");
    }
    for (const y of folds.y) {
      line(left, y, left + l, y, "fold");
      line(right - l, y, right, y, "fold");
    }
  }

  if (bounds && effectiveRegistration) {
    // One target centred in each margin. Along an edge with a fold, the fold
    // tick already sits at the middle, so the target goes to the middle of
    // the first panel instead of on top of it.
    const r = REGISTRATION_RADIUS_MM;
    const folds = interiorGuides(plan, bounds);
    const midX = folds.x.length > 0 ? (bounds.left + folds.x[0]) / 2 : (bounds.left + bounds.right) / 2;
    const midY = folds.y.length > 0 ? (bounds.top + folds.y[0]) / 2 : (bounds.top + bounds.bottom) / 2;
    const targets = [
      { cx: midX, cy: bounds.top / 2 },
      { cx: midX, cy: bounds.bottom + (plan.sheetHeightMm - bounds.bottom) / 2 },
      { cx: bounds.left / 2, cy: midY },
      { cx: bounds.right + (plan.sheetWidthMm - bounds.right) / 2, cy: midY },
    ];
    for (const { cx, cy } of targets) {
      circles.push({ cx, cy, r, kind: "registration" });
      lines.push({ x1: cx - r * 1.4, y1: cy, x2: cx + r * 1.4, y2: cy, kind: "registration" });
      lines.push({ x1: cx, y1: cy - r * 1.4, x2: cx, y2: cy + r * 1.4, kind: "registration" });
    }
  }

  return { allowance, cutting: effectiveCutting, registration: effectiveRegistration, lines, circles };
}
