import {beforeEach,expect,it,vi} from 'vitest';
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('openai',()=>({default:class{responses={create};}}));
import {POST} from '../app/api/classify/route';
const preview='data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xe0,0,2,0xff,0xd9]).toString('base64');
const input={preview,fileName:'label.pdf',pageCount:1,widthMm:89,heightMm:51};
const request=(body:unknown=input)=>POST(new Request('http://localhost/api/classify',{method:'POST',body:JSON.stringify(body)}));
beforeEach(()=>{vi.stubEnv('OPENAI_API_KEY','test');vi.stubEnv('OPENAI_MODEL','configured-model');create.mockReset();});
it('returns a validated suggestion using artwork and facts, configured model and strict structured output',async()=>{
 create.mockResolvedValue({output_text:JSON.stringify({suggestion:'sticker'})});const r=await request();expect(await r.json()).toEqual({suggestion:'sticker'});
 expect(create.mock.calls[0][0].model).toBe('configured-model');expect(create.mock.calls[0][0].store).toBe(false);expect(create.mock.calls[0][0].text.format.strict).toBe(true);
 const content=create.mock.calls[0][0].input[0].content;
 const {preview: image,...facts}=input;
 expect(JSON.parse(content[0].text)).toEqual(facts);
 expect(content[1]).toEqual({type:'input_image',image_url:image,detail:'high'});
 expect(create.mock.calls[0][0].instructions).toContain('untrusted document content');
});
it('rejects extra artwork data and multi-page requests',async()=>{
 expect((await request({...input,image:'data'})).status).toBe(400);expect((await request({...input,pageCount:2})).status).toBe(400);expect(create).not.toHaveBeenCalled();
});
it('falls back to unknown for outages, missing credentials and invalid output',async()=>{
 create.mockRejectedValue(new Error('offline'));expect(await (await request()).json()).toEqual({suggestion:'unknown'});
 create.mockResolvedValue({output_text:'{"suggestion":"book"}'});expect((await request()).status).toBe(502);
 vi.stubEnv('OPENAI_API_KEY','');expect((await request()).status).toBe(503);
});

it('rejects remote URLs, missing previews, non-JPEG and oversized payloads before calling OpenAI',async()=>{
 for(const preview of [undefined,'https://example.com/image.jpg','data:application/pdf;base64,JVBERg==','data:image/jpeg;base64,aGVsbG8=']) {
  expect((await request({...input,preview})).status).toBe(400);
 }
 expect((await request({...input,preview:'x'.repeat(1_010_001)})).status).toBe(413);
 expect(create).not.toHaveBeenCalled();
});
it('preserves unknown classifications without guessing',async()=>{
 create.mockResolvedValue({output_text:JSON.stringify({suggestion:'unknown'})});
 expect(await (await request()).json()).toEqual({suggestion:'unknown'});
});
