/** Shop plate coordinates use millimetres, top-left origin and clockwise turns. */
export interface PlateMarker {
  asset: 'corner' | 'centre';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180;
}
export interface PlateSetup {
  gripper: 'left' | 'right' | 'bottom';
  stripeWidth: number;
  artworkGap: number;
  label: string;
  labelX: number;
  labelY: number;
  rotation: 0 | 90 | 180;
  markers: PlateMarker[];
}
export const PLATE_WIDTH_MM = 530;
export const PLATE_HEIGHT_MM = 664;
export const GRIPPER_ARTWORK_GAP_MM = 45;
export const GRIPPER_STRIPE_MM = 15;
// Native PDF MediaBox sizes: 57.6 × 9 pt and 8.784 × 9.504 pt.
export const MARKER_SIZES = {
  corner: { width: 20.32, height: 3.175 },
  centre: { width: 3.0988, height: 3.3528 },
} as const;
