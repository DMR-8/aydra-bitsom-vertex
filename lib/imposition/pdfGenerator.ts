import { gripperText } from './gripperText';
import { PDFDocument, degrees, rgb, cmyk, StandardFonts, pushGraphicsState, popGraphicsState } from "pdf-lib";
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
export interface MarkerAssets { corner?: Uint8Array; centre?: Uint8Array; sticker?: Uint8Array }
export async function generateImposedPdf(sourceBytes: Uint8Array, plan: ImpositionPlan, markerAssets?: MarkerAssets): Promise<Uint8Array> {
  if (plan.error) throw new Error(plan.error);
  if (plan.sheets.length === 0) throw new Error("The plan has no sheets to write.");

  const source = await PDFDocument.load(sourceBytes);
  const output = await PDFDocument.create();

  // pdf-lib cannot embed pages with no Contents (including newly inserted blanks).
  // An empty graphics-state pair makes them embeddable without adding any marks.
  for (const page of source.getPages()) {
    if (!page.node.Contents()) page.pushOperators(pushGraphicsState(), popGraphicsState());
  }

  // Embed once; every placement of the same page reuses the same form XObject.
  const embedded = await output.embedPages(source.getPages());

  const hasShopMarks = plan.sheets.some(sheet => sheet.plate);
  if (hasShopMarks && (!markerAssets?.corner || !markerAssets?.centre)) throw new Error("The shop's Marka PDFs are required to write the plate marks.");
  const markerForms = hasShopMarks && markerAssets?.corner && markerAssets?.centre ? {
    corner: (await output.embedPdf(markerAssets.corner, [0]))[0],
    centre: (await output.embedPdf(markerAssets.centre, [0]))[0],
  } : null;
  const hasStickerMarks = plan.sheets.some(sheet => sheet.stickerMarks);
  if (hasStickerMarks && !markerAssets?.sticker) throw new Error("The sticker Marka PDF is required.");
  let stickerForm;
  if (hasStickerMarks && markerAssets?.sticker) {
    const markerDoc = await PDFDocument.load(markerAssets.sticker);
    const markerPage = markerDoc.getPage(0);
    if (markerDoc.getPageCount() !== 1 || Math.abs(markerPage.getWidth()-936)>0.01 || Math.abs(markerPage.getHeight()-1368)>0.01 || Math.abs(plan.sheetWidthMm-330.2)>0.01 || Math.abs(plan.sheetHeightMm-482.6)>0.01)
      throw new Error("Sticker markers require the native 13 × 19 inch sheet.");
    stickerForm = await output.embedPage(markerPage);
  }
  const labelFont = hasShopMarks ? await output.embedFont(StandardFonts.Helvetica) : null;
  const gripperFont = hasShopMarks ? await output.embedFont(StandardFonts.HelveticaBold) : null;
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

    if (sheet.plate && markerForms && labelFont && gripperFont) {
      const setup = sheet.plate;
      const stripe = setup.stripeWidth * POINTS_PER_MM;
      // Process-black stripe with white lettering running along its length.
      page.drawRectangle({
        x: setup.gripper === 'right' ? sheetWidthPt-stripe : 0,
        y: 0,
        width: setup.gripper === 'bottom' ? sheetWidthPt : stripe,
        height: setup.gripper === 'bottom' ? stripe : sheetHeightPt,
        color: cmyk(0,0,0,1),
      });
      const stripeText = gripperText(setup, plan.sheetWidthMm, plan.sheetHeightMm);
      const textCentre = toPt(stripeText.x, stripeText.y);
      const textWidth = gripperFont.widthOfTextAtSize(stripeText.text, stripeText.fontSizePt);
      const ascent = gripperFont.heightAtSize(stripeText.fontSizePt, { descender: false });
      const fullHeight = gripperFont.heightAtSize(stripeText.fontSizePt);
      const baselineOffset = ascent - fullHeight/2;
      const angle = -stripeText.rotation*Math.PI/180;
      page.drawText(stripeText.text, {
        x: textCentre.x-textWidth/2*Math.cos(angle)+baselineOffset*Math.sin(angle),
        y: textCentre.y-textWidth/2*Math.sin(angle)-baselineOffset*Math.cos(angle),
        font: gripperFont, size: stripeText.fontSizePt, color: cmyk(0,0,0,0),
        rotate: degrees(-stripeText.rotation),
      });
      for (const marker of setup.markers) {
        const form = markerForms[marker.asset];
        const left = marker.x*POINTS_PER_MM;
        const bottom = sheetHeightPt-(marker.y+marker.height)*POINTS_PER_MM;
        const width = marker.width*POINTS_PER_MM;
        const height = marker.height*POINTS_PER_MM;
        if (marker.rotation === 90) page.drawPage(form,{x:left,y:bottom+height,width:height,height:width,rotate:degrees(-90)});
        else if (marker.rotation === 180) page.drawPage(form,{x:left+width,y:bottom+height,width,height,rotate:degrees(180)});
        else page.drawPage(form,{x:left,y:bottom,width,height});
      }
      const fontSize=8;
      const labelWidth=labelFont.widthOfTextAtSize(setup.label,fontSize);
      const labelHeight=labelFont.heightAtSize(fontSize,{descender:false});
      const centre=toPt(setup.labelX,setup.labelY);
      const reversed=setup.rotation===180;
      page.drawText(setup.label,{
        x:centre.x+(reversed ? labelWidth/2 : -labelWidth/2),
        y:centre.y+(reversed ? labelHeight/2 : -labelHeight/2),
        size:fontSize,font:labelFont,color:cmyk(0,0,0,1),rotate:degrees(setup.rotation),
      });
    }

    // Preserve all four corner positions, strokes and colours from the supplied PDF.
    if (sheet.stickerMarks && stickerForm) page.drawPage(stickerForm, { x: 0, y: 0 });

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
