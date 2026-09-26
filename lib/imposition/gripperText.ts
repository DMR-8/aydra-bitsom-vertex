import type { PlateSetup } from './plateSettings';

/** Shared preview/PDF placement, in mm with clockwise rotation. */
export function gripperText(plate: PlateSetup, width: number, height: number) {
  return {
    text: 'Aydra Labs Gripper',
    fontSizePt: 36,
    x: plate.gripper === 'bottom' ? width/2 : plate.gripper === 'right' ? width-plate.stripeWidth/2 : plate.stripeWidth/2,
    y: plate.gripper === 'bottom' ? height-plate.stripeWidth/2 : height/2,
    rotation: plate.gripper === 'right' ? 270 : plate.gripper === 'left' ? 90 : 0,
  };
}
