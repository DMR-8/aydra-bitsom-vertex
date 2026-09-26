import { expect, it } from 'vitest';
import { planOffsetBook } from '../lib/imposition/offsetBook';
import { generateImposedPdf } from '../lib/imposition/pdfGenerator';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';
const assets={corner:new Uint8Array(readFileSync('public/marks/Marka.pdf')),centre:new Uint8Array(readFileSync('public/marks/Marka-Centre.pdf'))};

it('mirrors portrait artwork with 45 mm clearance, six strips and three centres',()=>{
 const plan=planOffsetBook({binding:'left',lotPot:null,pageCount:16});
 expect(plan.onPlate).toBe(true);
 expect(plan.sheets.map(s=>s.plate!.label)).toEqual(['Gripper-01','Gripper-02','Gripper-03','Gripper-04']);
 for(const sheet of plan.sheets){
  const p=sheet.plate!;expect(p.stripeWidth).toBe(15);
  const left=Math.min(...sheet.slots.map(s=>s.x));const right=Math.max(...sheet.slots.map(s=>s.x+s.width));
  expect(sheet.side==='back'?left:530-right).toBeCloseTo(45);
  expect(p.gripper).toBe(sheet.side==='back'?'left':'right');
  expect(p.rotation).toBe(sheet.side==='back'?180:0);
  expect(p.markers.filter(m=>m.asset==='corner')).toHaveLength(6);
  expect(p.markers.filter(m=>m.asset==='centre')).toHaveLength(3);
  for(const m of p.markers){expect(m.rotation).toBe(p.rotation);expect(m.x).toBeGreaterThanOrEqual(0);expect(m.y).toBeGreaterThanOrEqual(0);expect(m.x+m.width).toBeLessThanOrEqual(530);expect(m.y+m.height).toBeLessThanOrEqual(664);}
 }
 const front=plan.sheets[0],back=plan.sheets[1];
 for(const s of front.slots)expect(back.slots.some(b=>Math.abs(b.x-(530-s.x-s.width))<1e-6&&Math.abs(b.y-s.y)<1e-6)).toBe(true);
});
it('landscape always grips on the bottom, with artwork 45 mm above it',()=>{
 for(const binding of ['top','bottom'] as const)for(const lotPot of ['title','inner'] as const){
  const plan=planOffsetBook({binding,lotPot,pageCount:20});
  expect([plan.sheetWidthMm,plan.sheetHeightMm]).toEqual([664,530]);
  for(const sheet of plan.sheets){
   expect(sheet.plate!.gripper).toBe('bottom');
   expect(530-Math.max(...sheet.slots.map(s=>s.y+s.height))).toBeCloseTo(45);
   expect(sheet.plate!.markers.every(m=>m.rotation===90)).toBe(true);
   for(const m of sheet.plate!.markers){expect(m.x).toBeGreaterThanOrEqual(0);expect(m.y).toBeGreaterThanOrEqual(0);expect(m.x+m.width).toBeLessThanOrEqual(664);expect(m.y+m.height).toBeLessThanOrEqual(515);}
  }
 }
});
it('both portrait Lot-Pot choices grip on the right, independent of print order',()=>{
 for(const lotPot of ['title','inner'] as const){
  const plan=planOffsetBook({binding:'right',lotPot,pageCount:20});
  const sheet=plan.sheets.find(s=>s.lotPot)!;
  expect(sheet.plate!.gripper).toBe('right');expect(sheet.plate!.label).toBe(lotPot === 'title' ? 'Title LOT-POT' : 'Gripper-05 Lot-POT');
  expect(sheet.plate!.markers.every(m=>m.rotation===0)).toBe(true);
 }
});
it('embeds supplied vector markers, process-black stripe and plate labels',async()=>{
 const source=await PDFDocument.create();for(let n=0;n<8;n++)source.addPage([210*72/25.4,297*72/25.4]).drawText(String(n+1));
 const bytes=await source.save();const plan=planOffsetBook({binding:'left',lotPot:null,pageCount:8});
 await expect(generateImposedPdf(bytes,plan)).rejects.toThrow('Marka');
 const output=await PDFDocument.load(await generateImposedPdf(bytes,plan,assets));
 expect(output.getPageCount()).toBe(2);expect(output.getPage(0).getWidth()).toBeCloseTo(530*72/25.4);expect(output.getPage(0).getHeight()).toBeCloseTo(664*72/25.4);
 // Source pages + the two shared marker forms are embedded as vector XObjects.
 const xobjects=output.getPage(0).node.Resources()!.lookupMaybe((await import('pdf-lib')).PDFName.of('XObject'),(await import('pdf-lib')).PDFDict)!;
 expect(xobjects.keys().length).toBeGreaterThanOrEqual(6);
});

for (const binding of ['left','right','top','bottom'] as const) {
 for (const pageCount of [4,12,20,28]) {
  it(`${binding}, ${pageCount} pages: Title Lot-Pot does not consume a gripper number`,()=>{
   const plan=planOffsetBook({binding,pageCount,lotPot:'title'});
   const regularCount=(pageCount-4)/4;
   expect(plan.sheets.map(s=>s.plate!.label)).toEqual([
    'Title LOT-POT',
    ...Array.from({length:regularCount},(_,i)=>`Gripper-${String(i+1).padStart(2,'0')}`),
   ]);
   expect(plan.sheets[0].lotPot).toBe(true);
  });
  it(`${binding}, ${pageCount} pages: Inner Lot-Pot takes the next gripper number`,()=>{
   const plan=planOffsetBook({binding,pageCount,lotPot:'inner'});
   const regularCount=(pageCount-4)/4;
   expect(plan.sheets.map(s=>s.plate!.label)).toEqual([
    ...Array.from({length:regularCount},(_,i)=>`Gripper-${String(i+1).padStart(2,'0')}`),
    `Gripper-${String(regularCount+1).padStart(2,'0')} Lot-POT`,
   ]);
   expect(plan.sheets.at(-1)!.lotPot).toBe(true);
  });
 }
}
