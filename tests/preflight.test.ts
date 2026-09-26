import { expect, it } from 'vitest';
import { checkPreflight } from '../lib/preflight/check';
import type { PdfInspection } from '../lib/preflight/pdfInspector';
const facts = { encrypted:false, uniformPageSize:true, pageCount:16, color:{mode:'CMYK'} } as PdfInspection;
it('accepts A4 and both inclusive tolerance boundaries',()=>{
  for (const [width,height] of [[210,297],[205,292],[215,302]])
    expect(checkPreflight(facts,[{width:width*72/25.4,height:height*72/25.4}]).problems).toEqual([]);
});
it('rejects dimensions outside tolerance, Letter, and landscape A4',()=>{
  for (const [width,height] of [[204.99,297],[215.01,297],[210,291.99],[210,302.01],[215.9,279.4],[297,210]]) {
    const problems=checkPreflight(facts,[{width:width*72/25.4,height:height*72/25.4}]).problems;
    expect(problems[0]).toContain('Page 1');expect(problems[0]).toContain('210 × 297 mm');
  }
});
it('blocks mixed sizes and encryption; notes blanks and RGB',()=>{
  const result=checkPreflight({...facts,encrypted:true,uniformPageSize:false,pageCount:18,color:{...facts.color,mode:'RGB'}},[{width:210*72/25.4,height:297*72/25.4}]);
  expect(result.problems).toHaveLength(2);expect(result.notes).toHaveLength(2);
});
it('allows pamphlet formats in both orientations without asking for blanks',()=>{
 for(const count of [1,2])for(const [w,h] of [[148,210],[215.9,139.7],[210,297],[215.9,279.4]])for(const landscape of [false,true]){
  const result=checkPreflight({...facts,pageCount:count},[{width:(landscape?h:w)*72/25.4,height:(landscape?w:h)*72/25.4}]);
  expect(result.problems).toEqual([]);expect(result.notes).toEqual([]);
 }
});
it('keeps A4-only preflight for books and rejects unsupported/mixed pamphlet pages',()=>{
 expect(checkPreflight({...facts,pageCount:3},[{width:396,height:612}]).problems).not.toEqual([]);
 expect(checkPreflight({...facts,pageCount:1},[{width:100,height:100}]).problems).toEqual([]);
 expect(checkPreflight({...facts,pageCount:2},[{width:100,height:100}]).problems[0]).toContain('pamphlet');
 expect(checkPreflight({...facts,pageCount:1},[{width:0,height:100}]).problems).not.toEqual([]);
 expect(checkPreflight({...facts,pageCount:2,uniformPageSize:false},[{width:396,height:612}]).problems).toContain('Mixed page sizes are not supported.');
});
