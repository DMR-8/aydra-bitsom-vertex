import { applyPlateLayout } from './plateLayout';
import { PLATE_WIDTH_MM, PLATE_HEIGHT_MM } from './plateSettings';
import { A4_PAGE_SIZE, isSupportedPageSize } from '../paper';
import type { PageSize } from './types';
import { defaultSettingsFor } from './constants';
import { planImposition, type ImpositionPlan, type PlacedPage } from './layout';
export type Binding = 'left' | 'right' | 'top' | 'bottom';
export type LotPot = 'title' | 'inner';
export interface OffsetJob { binding: Binding; lotPot: LotPot | null; pageCount: number; pageSize?: PageSize }
export const needsLotPot = (pageCount: number) => pageCount % 8 === 4;
export function planOffsetBook(job: OffsetJob): ImpositionPlan {
  if (!Number.isInteger(job.pageCount) || job.pageCount < 4 || job.pageCount % 4) throw new Error('Page count must be a positive multiple of 4.');
  if (needsLotPot(job.pageCount) && !job.lotPot) throw new Error('Choose the Lot-Pot position.');
  const pageSize = job.pageSize ?? A4_PAGE_SIZE;
  if (!isSupportedPageSize(pageSize.width, pageSize.height)) throw new Error('Pages must be A4 portrait (210 × 297 mm, ±5 mm).');
  const landscape = job.binding === 'top' || job.binding === 'bottom';
  const turn = { left: 0, right: 180, top: 270, bottom: 90 }[job.binding];
  const plan = planImposition('offset-book', {
    ...defaultSettingsFor('offset-book'), plateSetting: '4-page', centerPin: true,
    gutter: 7.62, offsetGutterMm: 7.62, offsetOutput: 'plate', bookNUp: false,
    bookMixMatch: false, cuttingMarks: 'none', registrationMarks: false,
    plateWidthMm: landscape ? PLATE_HEIGHT_MM : PLATE_WIDTH_MM, plateHeightMm: landscape ? PLATE_WIDTH_MM : PLATE_HEIGHT_MM,
    lotPotPosition: job.lotPot ?? 'title',
  }, { pageCount: job.pageCount, pageSize: landscape ? { width: pageSize.height, height: pageSize.width } : pageSize })!;
  for (const sheet of plan.sheets) for (const slot of sheet.slots) {
    slot.rotation = (((slot.rotated ? 180 : 0) + turn) % 360) as PlacedPage['rotation'];
  }
  return applyPlateLayout(plan, landscape, job.lotPot);
}
