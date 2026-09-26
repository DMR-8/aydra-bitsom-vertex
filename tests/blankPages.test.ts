import { readFileSync } from 'node:fs';
const markerAssets = { corner: new Uint8Array(readFileSync('public/marks/Marka.pdf')), centre: new Uint8Array(readFileSync('public/marks/Marka-Centre.pdf')) };
import { expect, it } from 'vitest';
import { A4_PAGE_SIZE } from '../lib/paper';
import { PDFDocument } from 'pdf-lib';
import { insertBlankPages } from '../lib/imposition/blankPages';
import { planOffsetBook } from '../lib/imposition/offsetBook';
import { generateImposedPdf } from '../lib/imposition/pdfGenerator';
async function source() { const d=await PDFDocument.create(); for(let i=0;i<18;i++){const p=d.addPage([A4_PAGE_SIZE.width,A4_PAGE_SIZE.height]);p.drawText(`Page ${i+1}`);} return d; }
for (const position of ['end','before-back-cover'] as const) it(`inserts blanks ${position} and writes a valid PDF`, async () => {
  const d=await source(); d.getPage(17).setSize(A4_PAGE_SIZE.width-1,A4_PAGE_SIZE.height-1);
  const padded=await insertBlankPages(await d.save(),2,position);
  const result=await PDFDocument.load(padded);
  expect(result.getPageCount()).toBe(20);
  const lastOriginal=position==='end'?17:19;
  expect(result.getPage(lastOriginal).getWidth()).toBeCloseTo(A4_PAGE_SIZE.width-1);
  for(const i of position==='end'?[18,19]:[17,18]) {expect(result.getPage(i).getSize()).toEqual(A4_PAGE_SIZE);expect(result.getPage(i).node.Contents()).toBeUndefined();}
  const output=await generateImposedPdf(padded,planOffsetBook({binding:'top',lotPot:'title',pageCount:20}),markerAssets);
  const imposed=await PDFDocument.load(output);expect(imposed.getPageCount()).toBe(5);expect(imposed.getPage(0).getWidth()).toBeCloseTo(664*72/25.4);
});
it('rejects invalid blank counts',async()=>{await expect(insertBlankPages(new Uint8Array(),4,'end')).rejects.toThrow();});

it('preserves the actual accepted source size for blanks and slots',async()=>{
  const size={width:215*72/25.4,height:302*72/25.4};
  const doc=await PDFDocument.create();for(let i=0;i<6;i++)doc.addPage([size.width,size.height]);
  const bytes=await insertBlankPages(await doc.save(),2,'before-back-cover');
  const padded=await PDFDocument.load(bytes);
  for(const page of padded.getPages())expect(page.getSize()).toEqual(size);
  const plan=planOffsetBook({binding:'left',pageCount:8,lotPot:null,pageSize:size});
  const output=await PDFDocument.load(await generateImposedPdf(bytes,plan,markerAssets));
  expect(output.getPage(0).getWidth()).toBeCloseTo(530*72/25.4);
  expect(output.getPage(0).getHeight()).toBeCloseTo(664*72/25.4);
});
