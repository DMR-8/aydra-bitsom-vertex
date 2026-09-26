import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { ImpositionPlan } from "./layout";

const POINTS_PER_MM = 72 / 25.4;

/**
 * Writes the imposed PDF: one output page per planned sheet, with each source
 * page drawn at the size and position the plan gives it.
 *
 * The plan is in millimetres with a top-left origin and y running down; PDF
 * space is points with a bottom-left origin and y running up, so every slot is
 * flipped on the way in. Rotation changes the drawing origin and, for quarter
 * turns, swaps the unrotated dimensions so the content stays inside its slot.
 */
export async function generateImposedPdf(sourceBytes: Uint8Array, plan: ImpositionPlan): Promise<Uint8Array> {
  if (plan.error) throw new Error(plan.error);
  if (plan.sheets.length === 0) throw new Error("The plan has no sheets to write.");

  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const output = await PDFDocument.create();

  // Embed once; every placement of the same page reuses the same form XObject.
  const embedded = await output.embedPages(source.getPages());

  const sheetWidthPt = plan.sheetWidthMm * POINTS_PER_MM;
  const sheetHeightPt = plan.sheetHeightMm * POINTS_PER_MM;
  const black = rgb(0, 0, 0);
  const MARK_STROKE_PT = 0.25;
  const toPt = (xMm: number, yMm: number) => ({ x: xMm * POINTS_PER_MM, y: sheetHeightPt - yMm * POINTS_PER_MM });

  for (const sheet of plan.sheets) {
    const page = output.addPage([sheetWidthPt, sheetHeightPt]);

    for (const slot of sheet.slots) {
      if (slot.page === null) continue;
      const form = embedded[slot.page - 1];
      if (!form) continue;

      const width = slot.width * POINTS_PER_MM;
      const height = slot.height * POINTS_PER_MM;
      const left = slot.x * POINTS_PER_MM;
      const bottom = sheetHeightPt - (slot.y + slot.height) * POINTS_PER_MM;

      const rotation = slot.rotation ?? (slot.rotated ? 180 : 0);
      if (rotation === 90) {
        page.drawPage(form, { x: left, y: bottom + height, width: height, height: width, rotate: degrees(-90) });
      } else if (rotation === 270) {
        page.drawPage(form, { x: left + width, y: bottom, width: height, height: width, rotate: degrees(90) });
      } else if (rotation === 180) {
        page.drawPage(form, { x: left + width, y: bottom + height, width, height, rotate: degrees(180) });
      } else {
        page.drawPage(form, { x: left, y: bottom, width, height });
      }
    }

    // Marks go on last, over any bleed that reaches into the margin.
    const marks = sheet.marks ?? plan.marks;
    if (marks) {
      for (const line of marks.lines) {
        page.drawLine({ start: toPt(line.x1, line.y1), end: toPt(line.x2, line.y2), thickness: MARK_STROKE_PT, color: black });
      }
      for (const circle of marks.circles) {
        const centre = toPt(circle.cx, circle.cy);
        page.drawCircle({ x: centre.x, y: centre.y, size: circle.r * POINTS_PER_MM, borderWidth: MARK_STROKE_PT, borderColor: black, color: undefined });
      }
    }
  }

  output.setProducer("Aydra Pressflow");
  output.setCreator("Aydra Pressflow PDF Imposer");
  return output.save();
}
