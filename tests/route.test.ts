import { beforeEach, expect, it, vi } from 'vitest';
const { create }=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('openai',()=>({default:class{ responses={create}; }}));
import { POST } from '../app/api/assistant/route';
import { emptyState } from '../lib/assistant/jobState';
const base={preflight:{fileName:'book.pdf',pageCount:20,pageWidthIn:210/25.4,pageHeightIn:297/25.4,uniform:true,colorMode:'CMYK'},state:emptyState,messages:[{role:'user',content:'top bind with inner lot pot'}]};
function output(updates={}, rest={}){create.mockResolvedValue({output_text:JSON.stringify({reply:'Review the plan.',updates:{...emptyState,...updates},asking:null,outOfScope:false,...rest})});}
async function request(body:unknown=base){const response=await POST(new Request('http://localhost/api/assistant',{method:'POST',body:JSON.stringify(body)}));return{status:response.status,...await response.json()};}
beforeEach(()=>{vi.stubEnv('OPENAI_API_KEY','test-only');vi.stubEnv('OPENAI_MODEL','test-model');create.mockReset();});
it('accepts top bind and inner Lot-Pot',async()=>{output({binding:'top',lotPot:'inner'});const r=await request();expect(r.ready).toBe(true);expect(r.state.binding).toBe('top');expect(create.mock.calls[0][0].model).toBe('test-model');expect(create.mock.calls[0][0].text.format.strict).toBe(true);});
it('asks binding with four choices for a vague booklet request',async()=>{output();const r=await request({...base,messages:[{role:'user',content:'make a booklet'}]});expect(r.question.field).toBe('binding');expect(r.question.options).toHaveLength(4);});
it('rejects an invented Lot-Pot and cannot skip the next question',async()=>{output({binding:'top',lotPot:'title'});const r=await request({...base,messages:[{role:'user',content:'top bind'}]});expect(r.ready).toBe(false);expect(r.state.lotPot).toBeNull();expect(r.question.field).toBe('lotPot');expect(r.reply).toContain('19, 20');});
it('asks missing Lot-Pot even with asking null',async()=>{output({binding:'top'});const r=await request();expect(r.question.field).toBe('lotPot');expect(r.ready).toBe(false);});
it('out of scope cannot change state',async()=>{output({binding:'right'},{outOfScope:true});const r=await request({...base,messages:[{role:'user',content:'convert to CMYK'}]});expect(r.outOfScope).toBe(true);expect(r.state).toEqual(emptyState);});
it('handles blanks first and then reassesses the Lot-Pot',async()=>{output({binding:'top'});const r=await request({...base,preflight:{...base.preflight,pageCount:18}});expect(r.question.field).toBe('blankPages');});
it('ignores irrelevant Lot-Pot on 16 pages',async()=>{output({binding:'top',lotPot:'inner'});const r=await request({...base,preflight:{...base.preflight,pageCount:16}});expect(r.ready).toBe(true);expect(r.state.lotPot).toBeNull();expect(r.reply).toContain('No Lot-Pot');});
it('invalid model JSON and provider failures produce usable errors',async()=>{create.mockResolvedValue({output_text:'bad'});expect((await request()).status).toBe(502);create.mockRejectedValue(new Error('offline'));expect((await request()).status).toBe(502);});
it('missing credentials return 503',async()=>{vi.stubEnv('OPENAI_API_KEY','');expect((await request()).status).toBe(503);expect(create).not.toHaveBeenCalled();});
it('rejects bad preflight and caps chat data',async()=>{expect((await request({...base,preflight:{...base.preflight,pageWidthIn:216/25.4}})).status).toBe(400);output();await request({...base,messages:Array.from({length:25},()=>({role:'user',content:'x'.repeat(3000)}))});expect(create.mock.calls[0][0].input).toHaveLength(20);expect(create.mock.calls[0][0].input[0].content).toHaveLength(2000);});

it('accepts tolerance boundaries and rejects invalid heights',async()=>{
  for (const [w,h] of [[205,292],[215,302]]) {
    output({binding:'top',lotPot:'inner'});
    expect((await request({...base,preflight:{...base.preflight,pageWidthIn:w/25.4,pageHeightIn:h/25.4}})).status).toBe(200);
  }
  expect((await request({...base,preflight:{...base.preflight,pageHeightIn:303/25.4}})).status).toBe(400);
});

it('describes the fixed plate and gripper setup to the model and operator',async()=>{
  output({}, {outOfScope:true});const r=await request();
  expect(r.reply).toContain('530 × 664 mm');expect(r.reply).toContain('gripper');
  expect(create.mock.calls[0][0].instructions).toContain('Landscape plates always grip at the bottom');
  expect(create.mock.calls[0][0].instructions).toContain('15 mm solid black');
});
it('asks quantity only for pamphlets and accepts the extracted quantity',async()=>{
 const input={...base,preflight:{...base.preflight,pageCount:2,pageWidthIn:5.5,pageHeightIn:8.5},messages:[{role:'user',content:'I need 3000 copies'}]};
 output({quantity:3000,binding:'left',lotPot:'title',blankPages:'end'});
 const r=await request(input);expect(r.ready).toBe(true);expect(r.state).toEqual({...emptyState,quantity:3000});expect(r.missing).toEqual([]);
 expect(create.mock.calls[0][0].instructions).toContain('pamphlet job');
 output({}, {asking:'binding'});const incomplete=await request(input);
 expect(incomplete.question.field).toBe('quantity');expect(incomplete.ready).toBe(false);expect(incomplete.reply).toContain('finished copies');
});
it('accepts A4/Letter/A5/half-letter pamphlets but refuses unrelated formats',async()=>{
 for(const [w,h]of [[5.5,8.5],[8.5,5.5],[8.5,11],[210/25.4,297/25.4],[148/25.4,210/25.4]]){
  output({quantity:1000});expect((await request({...base,preflight:{...base.preflight,pageCount:1,pageWidthIn:w,pageHeightIn:h}})).status).toBe(200);
 }
 expect((await request({...base,preflight:{...base.preflight,pageCount:1,pageWidthIn:2,pageHeightIn:2}})).status).toBe(400);
});
it('rejects invalid model quantities and keeps the quantity on out-of-scope requests',async()=>{
 const input={...base,preflight:{...base.preflight,pageCount:1},state:{...emptyState,quantity:1000}};
 output({quantity:1.5});expect((await request(input)).status).toBe(502);
 output({quantity:9000},{outOfScope:true});const r=await request(input);expect(r.state.quantity).toBe(1000);expect(r.reply).toContain('pamphlet');
});
