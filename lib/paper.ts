/** A4 portrait, allowing up to 5 mm variation on each dimension. */
export const A4_PAGE_SIZE = { width: 210 * 72 / 25.4, height: 297 * 72 / 25.4 };
export function isSupportedPageSize(widthPt: number, heightPt: number): boolean {
  const widthMm = widthPt * 25.4 / 72;
  const heightMm = heightPt * 25.4 / 72;
  return Number.isFinite(widthMm) && Number.isFinite(heightMm)
    && Math.abs(widthMm - 210) <= 5 + 1e-7
    && Math.abs(heightMm - 297) <= 5 + 1e-7;
}
