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
