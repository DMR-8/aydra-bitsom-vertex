import { expect, it } from 'vitest';
import { PDFDocument, StandardFonts, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib';
import { readFileSync } from 'node:fs';
import { planOffsetBook } from '../lib/imposition/offsetBook';
import { gripperText } from '../lib/imposition/gripperText';
import { generateImposedPdf } from '../lib/imposition/pdfGenerator';

it('centres readable lengthwise lettering inside every gripper stripe',async()=>{
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.HelveticaBold);
 for(const binding of ['left','right','top','bottom'] as const){
  const plan=planOffsetBook({binding,lotPot:'title',pageCount:12});
  for(const sheet of plan.sheets){
   const setup=sheet.plate!, text=gripperText(setup,plan.sheetWidthMm,plan.sheetHeightMm);
   expect(text.text).toBe('Aydra Labs Gripper');
   const height=font.heightAtSize(text.fontSizePt)*25.4/72;
   const length=font.widthOfTextAtSize(text.text,text.fontSizePt)*25.4/72;
   expect(height).toBeLessThan(setup.stripeWidth-2);
   if(setup.gripper==='bottom'){
    expect(text.rotation).toBe(0);expect(text.x).toBe(plan.sheetWidthMm/2);
    expect(text.y).toBe(plan.sheetHeightMm-7.5);expect(length).toBeLessThan(plan.sheetWidthMm);
   }else{
    expect(text.rotation).toBe(setup.gripper==='right'?270:90);
    expect(text.x).toBe(setup.gripper==='right'?plan.sheetWidthMm-7.5:7.5);
    expect(text.y).toBe(plan.sheetHeightMm/2);expect(length).toBeLessThan(plan.sheetHeightMm);
   }
  }
 }
});
it('writes white stripe lettering into each generated plate PDF page',async()=>{
 const source=await PDFDocument.create();for(let i=0;i<8;i++)source.addPage([210*72/25.4,297*72/25.4]);
 const assets={corner:new Uint8Array(readFileSync('public/marks/Marka.pdf')),centre:new Uint8Array(readFileSync('public/marks/Marka-Centre.pdf'))};
 for(const binding of ['left','top'] as const){
  const output=await PDFDocument.load(await generateImposedPdf(await source.save(),planOffsetBook({binding,lotPot:null,pageCount:8}),assets));
  for(const page of output.getPages()){
   const streams=(page.node.Contents() as PDFArray).asArray().map(ref=>output.context.lookup(ref) as PDFRawStream);
   const content=streams.map(s=>new TextDecoder().decode(decodePDFRawStream(s).decode())).join('\n');
   const textHex=Buffer.from('Aydra Labs Gripper').toString('hex').toUpperCase();
   expect(content).toContain(`<${textHex}> Tj`);
   const textBlock=content.slice(0,content.indexOf(`<${textHex}> Tj`)).split('BT').at(-1)!;
   expect(textBlock).toContain('0 0 0 0 k');
   expect(textBlock).toContain('36 Tf');
  }
 }
});
