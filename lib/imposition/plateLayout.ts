import type { ImpositionPlan, PlannedSheet } from './layout';
import type { LotPotPosition } from './types';
import { GRIPPER_ARTWORK_GAP_MM, GRIPPER_STRIPE_MM, MARKER_SIZES, type PlateMarker } from './plateSettings';

/** Place the unchanged planner's page map relative to the machine's gripper. */
export function applyPlateLayout(plan: ImpositionPlan, landscape: boolean, lotPot: LotPotPosition | null): ImpositionPlan {
  let sequence = 0;
  for (const sheet of plan.sheets) {
    const titleLotPot = !!sheet.lotPot && lotPot === 'title';
    if (!titleLotPot) sequence++;
    const gripper = landscape ? 'bottom' : sheet.side === 'back' ? 'left' : 'right';
    const left = Math.min(...sheet.slots.map(s => s.x));
    const top = Math.min(...sheet.slots.map(s => s.y));
    const width = Math.max(...sheet.slots.map(s => s.x+s.width)) - left;
    const height = Math.max(...sheet.slots.map(s => s.y+s.height)) - top;
    const x = gripper === 'bottom' ? (plan.sheetWidthMm-width)/2 : gripper === 'right' ? plan.sheetWidthMm-GRIPPER_ARTWORK_GAP_MM-width : GRIPPER_ARTWORK_GAP_MM;
    const y = gripper === 'bottom' ? plan.sheetHeightMm-GRIPPER_ARTWORK_GAP_MM-height : (plan.sheetHeightMm-height)/2;
    const dx=x-left, dy=y-top;
    for (const slot of sheet.slots) { slot.x+=dx; slot.y+=dy; }
    sheet.guides = { x: plan.guides?.x.map(v=>v+dx) ?? [], y: plan.guides?.y.map(v=>v+dy) ?? [] };
    const rotation = gripper === 'bottom' ? 90 : gripper === 'left' ? 180 : 0;
    const midY = sheet.guides.y[0] ?? y+height/2;
    sheet.plate = {
      gripper, stripeWidth: GRIPPER_STRIPE_MM, artworkGap: GRIPPER_ARTWORK_GAP_MM,
      label: titleLotPot ? 'Title LOT-POT' : `Gripper-${String(sequence).padStart(2,'0')}${sheet.lotPot ? ' Lot-POT' : ''}`,
      labelX: gripper === 'left' ? x+58 : x+width-58,
      labelY: midY,
      rotation: gripper === 'left' ? 180 : 0,
      markers: makeMarkers(sheet, x, y, width, height, rotation),
    };
    if (x < 0 || y < 0 || x+width > plan.sheetWidthMm || y+height > plan.sheetHeightMm) {
      plan.error = 'The page arrangement does not fit on this plate with the required 45 mm gripper clearance.';
    }
  }
  // Guides vary by side because the gripper offsets are mirrored.
  plan.guides = undefined;
  return plan;
}

function makeMarkers(sheet: PlannedSheet, x: number, y: number, width: number, height: number, rotation: 0 | 90 | 180): PlateMarker[] {
  const markers: PlateMarker[] = [];
  const right=x+width, bottom=y+height;
  const midY=sheet.guides!.y[0];
  const spine=sheet.guides!.x[0];
  function add(asset: PlateMarker['asset'], cx: number, cy: number) {
    const native=MARKER_SIZES[asset];
    const w=rotation === 90 ? native.height : native.width;
    const h=rotation === 90 ? native.width : native.height;
    markers.push({asset,x:cx-w/2,y:cy-h/2,width:w,height:h,rotation});
  }
  if (rotation === 90) {
    // Vertical strips sit outside the page block, clear of the narrow row gutter.
    for (const cx of [x-2.5,right+2.5]) for (const cy of [y+MARKER_SIZES.corner.width/2,midY,bottom-MARKER_SIZES.corner.width/2]) add('corner',cx,cy);
  } else {
    for (const cy of [y-2.5,midY,bottom+2.5]) for (const cx of [x+MARKER_SIZES.corner.width/2,right-MARKER_SIZES.corner.width/2]) add('corner',cx,cy);
  }
  for (const cy of [y-2.5,midY,bottom+2.5]) add('centre',spine,cy);
  return markers;
}
