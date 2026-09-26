import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {planSticker} from '../lib/imposition/sticker';
import {generateImposedPdf} from '../lib/imposition/pdfGenerator';
const size=(w:number,h:number)=>({width:w*72/25.4,height:h*72/25.4});
it('keeps actual dimensions, all edges and corners clear, gaps and centred bounds across sizes',()=>{
 for(const [w,h] of [[89,51],[50,30],[100,70],[148,210],[210,297],[300,460],[20,20],[51,89]]){
  const p=planSticker(size(w,h));expect(p.error).toBeNull();const slots=p.sheets[0].slots;
  for(const s of slots){
   expect(s.width).toBeCloseTo(s.rotation?h:w);expect(s.height).toBeCloseTo(s.rotation?w:h);
   expect(s.x).toBeGreaterThanOrEqual(8-1e-6);expect(s.y).toBeGreaterThanOrEqual(8-1e-6);
   expect(s.x+s.width).toBeLessThanOrEqual(322.2+1e-6);expect(s.y+s.height).toBeLessThanOrEqual(474.6+1e-6);
   expect((s.x<15-1e-6||s.x+s.width>315.2+1e-6)&&(s.y<15-1e-6||s.y+s.height>467.6+1e-6)).toBe(false);
  }
  for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){
   const a=slots[i],b=slots[j];expect(a.x+a.width+2<=b.x+1e-6||b.x+b.width+2<=a.x+1e-6||a.y+a.height+2<=b.y+1e-6||b.y+b.height+2<=a.y+1e-6).toBe(true);
  }
  expect(Math.min(...slots.map(s=>s.x))+Math.max(...slots.map(s=>s.x+s.width))).toBeCloseTo(330.2);
  expect(Math.min(...slots.map(s=>s.y))+Math.max(...slots.map(s=>s.y+s.height))).toBeCloseTo(482.6);
 }
});
it('finds a mixed arrangement exceeding both uniform grids',()=>{
 const p=planSticker(size(89,51)),slots=p.sheets[0].slots;
 const fit=(w:number,h:number)=>Math.floor((314.2+2)/(w+2))*Math.floor((466.6+2)/(h+2));
 expect(slots.length).toBeGreaterThan(Math.max(fit(89,51),fit(51,89)));
 expect(new Set(slots.map(s=>s.rotation)).size).toBe(2);
});
it('rejects invalid and oversized items and exports a single correctly sized sheet without marker assets',async()=>{
 expect(planSticker(size(600,600)).error).toBeTruthy();expect(planSticker(size(0,30)).error).toBeTruthy();
 const source=await PDFDocument.create();source.addPage([89*72/25.4,51*72/25.4]);
 const out=await PDFDocument.load(await generateImposedPdf(await source.save(),planSticker(size(89,51))));
 expect(out.getPageCount()).toBe(1);expect(out.getPage(0).getWidth()).toBeCloseTo(13*72);expect(out.getPage(0).getHeight()).toBeCloseTo(19*72);
});
