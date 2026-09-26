import { describe, expect, it } from 'vitest';
import { planOffsetBook, type Binding } from '../lib/imposition/offsetBook';
const opposite: Record<Binding, Binding> = { left:'right', right:'left', top:'bottom', bottom:'top' };
const edges = { left: { 0:'left', 90:'bottom', 180:'right', 270:'top' }, right: { 0:'right', 90:'top', 180:'left', 270:'bottom' } };
for (const binding of ['left','right','top','bottom'] as const) describe(binding, () => {
  for (const [widthMm,heightMm] of [[205,292],[210,297],[215,302]]) for (const pageCount of [4,8,12,16,20,24,28]) for (const lotPot of pageCount % 8 === 4 ? ['title','inner'] as const : [null]) it(`${pageCount} pages, ${lotPot}, ${widthMm} × ${heightMm} mm`, () => {
    const plan = planOffsetBook({ binding, pageCount, lotPot, pageSize: { width: widthMm*72/25.4, height: heightMm*72/25.4 } });
    expect(plan.error).toBeNull(); expect(plan.warnings).toEqual([]);
    expect([plan.sheetWidthMm,plan.sheetHeightMm]).toEqual(['top','bottom'].includes(binding) ? [664,530] : [530,664]);
    const landscape = ['top','bottom'].includes(binding);
    for (const slot of plan.sheets.flatMap(s => s.slots)) {
      expect(slot.width).toBeCloseTo(landscape ? heightMm : widthMm);
      expect(slot.height).toBeCloseTo(landscape ? widthMm : heightMm);
    }
    const slots = plan.sheets.flatMap(s => s.slots);
    expect(slots.map(s => s.page).sort((a,b) => a! - b!)).toEqual(Array.from({length:pageCount},(_,i) => i+1));
    for (const marks of [plan.marks, ...plan.sheets.map(s => s.marks)]) { expect(marks?.lines ?? []).toEqual([]); expect(marks?.circles ?? []).toEqual([]); }
    for (const s of slots) {
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x+s.width).toBeLessThanOrEqual(plan.sheetWidthMm+1e-6); expect(s.y+s.height).toBeLessThanOrEqual(plan.sheetHeightMm+1e-6);
      const spine = plan.sheets.find(sheet => sheet.slots.includes(s))!.guides!.x[0];
      const side = Math.abs(s.x-spine)<1e-6 ? 'left' : 'right';
      expect(Math.abs((side === 'left' ? s.x : s.x+s.width)-spine)).toBeLessThan(1e-6);
      expect(edges[side][s.rotation!]).toBe(s.page! % 2 ? binding : opposite[binding]);
    }
  });
});
it('rejects an incomplete job', () => {
  expect(() => planOffsetBook({ binding:'left', pageCount:18, lotPot:null })).toThrow();
  expect(() => planOffsetBook({ binding:'left', pageCount:20, lotPot:null })).toThrow();
});
