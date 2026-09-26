import type { PageSize, Unit } from "./types";

export const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;

export function mmToUnit(mm: number, unit: Unit) {
  return unit === "mm" ? mm : mm / MM_PER_INCH;
}

export function unitToMm(value: number, unit: Unit) {
  return unit === "mm" ? value : value * MM_PER_INCH;
}

export function pointsToMm(points: number) {
  return (points / POINTS_PER_INCH) * MM_PER_INCH;
}

/** Decimal places worth showing: 2 for mm, 4 for inches (matches the Corel tools). */
export function unitDecimals(unit: Unit) {
  return unit === "mm" ? 2 : 4;
}

export function roundForUnit(value: number, unit: Unit) {
  const factor = 10 ** unitDecimals(unit);
  return Math.round(value * factor) / factor;
}

/** "210 × 297 mm" / "8.5 × 11 in" for a size held in millimetres. */
export function formatSizeMm(widthMm: number, heightMm: number, unit: Unit) {
  const w = mmToUnit(widthMm, unit);
  const h = mmToUnit(heightMm, unit);
  const digits = unit === "mm" ? 1 : 3;
  return `${trimZeros(w, digits)} × ${trimZeros(h, digits)} ${unit}`;
}

/** "420 × 297 mm (16.54 × 11.69 in)" — both systems, for labels that must not be misread. */
export function formatSizeBoth(widthMm: number, heightMm: number) {
  return `${formatSizeMm(widthMm, heightMm, "mm")} (${formatSizeMm(widthMm, heightMm, "in")})`;
}

export function formatLength(mm: number, unit: Unit) {
  return `${trimZeros(mmToUnit(mm, unit), unit === "mm" ? 1 : 3)} ${unit}`;
}

function trimZeros(value: number, digits: number) {
  return Number(value.toFixed(digits)).toString();
}

/**
 * Picks the unit a PDF was most likely designed in. A4 is 210 × 297 mm exactly but
 * 8.27 × 11.69 in; Letter is 8.5 × 11 in exactly but 215.9 × 279.4 mm. Whichever
 * system gives clean numbers for both edges wins; ties and unclear sizes fall back
 * to millimetres, which is what Pressflow otherwise defaults to.
 */
export function detectUnit(pageSize: PageSize | null): Unit {
  if (!pageSize) return "mm";

  const isCleanMm = (points: number) => {
    const mm = pointsToMm(points);
    return Math.abs(mm - Math.round(mm)) < 0.2;
  };
  const isCleanInch = (points: number) => {
    const inches = points / POINTS_PER_INCH;
    const sixteenths = inches * 16;
    return Math.abs(sixteenths - Math.round(sixteenths)) < 0.02;
  };

  const metric = isCleanMm(pageSize.width) && isCleanMm(pageSize.height);
  const imperial = isCleanInch(pageSize.width) && isCleanInch(pageSize.height);

  if (imperial && !metric) return "in";
  return "mm";
}
