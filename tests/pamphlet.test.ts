import { expect, it } from 'vitest';
import { planPamphlet, PAMPHLET_QUANTITY_POLICY } from '../lib/imposition/pamphlet';
import { classifyPamphletPaper } from '../lib/paper';
import reference from './fixtures/pamphlet-reference.json';
const policy=PAMPHLET_QUANTITY_POLICY;
const pt=(mm:number)=>mm*72/25.4;
it('matches all eight measured shop reference layouts, heads and front/back assignments',()=>{
 for(const f of reference.layouts){
  const half=f.page<=4, large=half?f.page>=3:f.page>=7;
  const pageSize=half?{width:396,height:612}:{width:612,height:792};
  const plan=planPamphlet({pageSize,pageCount:f.page%2?1:2,quantity:large?5000:1000},policy);
  expect(plan.pamphlet.referencePage).toBe(f.page);
  const slots=plan.sheets[0].slots;
  expect(slots.map(s=>s.rotation)).toEqual(f.rotations);
  expect(slots.map(s=>s.page)).toEqual(f.sourcePages);
  for(const [i,s] of slots.entries()){
   const [x,y,w,h]=f.rectanglesMm[i];
   expect(s.x).toBeCloseTo(x,2);expect(s.width).toBeCloseTo(w,2);expect(s.height).toBeCloseTo(h,2);
   // The sample is off centre by at most 0.2 mm. Production centres exactly.
   expect(Math.abs(s.y-y)).toBeLessThan(.25);
  }
  expect(plan.sheets[0].plate!.gripper).toBe('right');
  expect(530-Math.max(...slots.map(s=>s.x+s.width))).toBeCloseTo(45);
 }
});
it('selects either side of each configured quantity cutoff',()=>{
 for(const [width,height,cutoff,low,high] of [[396,612,policy.halfLargeFrom,1,3],[612,792,policy.fullLargeFrom,5,7]]){
  for(const [quantity,page]of [[cutoff-1,low],[cutoff,high]])expect(planPamphlet({pageCount:1,pageSize:{width,height},quantity},policy).pamphlet.referencePage).toBe(page);
 }
});
it('preserves source dimensions across ISO/imperial sizes and both input orientations',()=>{
 for(const [w,h]of [[148,210],[139.7,215.9],[210,297],[215.9,279.4]])for(const landscape of [false,true])for(const quantity of [1000,5000])for(const pageCount of [1,2]){
  const pageSize={width:pt(landscape?h:w),height:pt(landscape?w:h)};
  const plan=planPamphlet({pageSize,pageCount,quantity},policy);
  expect(plan.error).toBeNull();expect(plan.warnings).toEqual([]);
  for(const s of plan.sheets[0].slots){
   const dimensions=[s.width,s.height].sort((a,b)=>a-b);expect(dimensions[0]).toBeCloseTo(w);expect(dimensions[1]).toBeCloseTo(h);
   expect(s.x).toBeGreaterThanOrEqual(0);expect(s.y).toBeGreaterThanOrEqual(0);
   expect(s.x+s.width).toBeLessThanOrEqual(485+1e-6);expect(s.y+s.height).toBeLessThanOrEqual(664);
  }
 }
});
it('backs each front position with page 2 and matching heads after work-and-tumble',()=>{
 for(const pageSize of [{width:396,height:612},{width:612,height:396},{width:612,height:792},{width:792,height:612}])for(const quantity of [1000,5000]){
  const p=planPamphlet({pageCount:2,pageSize,quantity},policy);
  const head={0:[0,-1],90:[1,0],180:[0,1],270:[-1,0]};
  for(const s of p.sheets[0].slots.filter(s=>s.page===1)){
   const back=p.sheets[0].slots.find(b=>b.page===2&&Math.abs(b.x-s.x)<1e-6&&Math.abs(b.y-(664-s.y-s.height))<1e-6)!;
   expect(back).toBeDefined();const [hx,hy]=head[s.rotation!], [bx,by]=head[back.rotation!];
   expect(hx).toBe(bx);expect(hy+by).toBe(0);
  }
 }
});
it('counts finished pieces only after both passes for double-sided jobs',()=>{
 const p=planPamphlet({pageCount:2,pageSize:{width:396,height:612},quantity:1001},policy);
 expect(p.pamphlet.finishedPerSheet).toBe(4);expect(p.pamphlet.netSheets).toBe(251);expect(p.pamphlet.impressions).toBe(502);
 const single=planPamphlet({pageCount:1,pageSize:{width:396,height:612},quantity:1001},policy);
 expect(single.pamphlet.impressions).toBe(251);
});
it('rejects unsupported size, page count, and invalid quantities',()=>{
 expect(classifyPamphletPaper(pt(300),pt(400))).toBeNull();
 for(const quantity of [0,-1,1.5,NaN,Infinity,1_000_000_001])expect(()=>planPamphlet({pageCount:1,pageSize:{width:396,height:612},quantity},policy)).toThrow();
 expect(()=>planPamphlet({pageCount:3,pageSize:{width:396,height:612},quantity:1000},policy)).toThrow();
});

it('pins the provisional overlap and equality decisions',()=>{
 for(const quantity of [4001,4099,4100])expect(planPamphlet({pageCount:1,pageSize:{width:396,height:612},quantity}).pamphlet.referencePage).toBe(3);
 expect(planPamphlet({pageCount:1,pageSize:{width:612,height:792},quantity:2100}).pamphlet.referencePage).toBe(5);
});
