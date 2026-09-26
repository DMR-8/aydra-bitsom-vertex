import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const {getDocument}=vi.hoisted(()=>({getDocument:vi.fn()}));
vi.mock('../lib/preflight/pdfEngine',()=>({getDocument}));
import {classificationPreview} from '../lib/preflight/classificationPreview';
const image='data:image/jpeg;base64,/9j/4AAC/9k=';
const render=vi.fn(),destroy=vi.fn(),toDataURL=vi.fn();
let canvas:{width:number;height:number;toDataURL:typeof toDataURL};
let pdf:{numPages:number;getPage:ReturnType<typeof vi.fn>};
const file={arrayBuffer:async()=>new ArrayBuffer(10)} as File;
beforeEach(()=>{
 render.mockReset().mockReturnValue({promise:Promise.resolve()});destroy.mockReset().mockResolvedValue(undefined);toDataURL.mockReset().mockReturnValue(image);
 canvas={width:0,height:0,toDataURL};
 vi.stubGlobal('document',{createElement:vi.fn(()=>canvas)});
 pdf={numPages:1,getPage:vi.fn(async()=>({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render}))};
 getDocument.mockReset().mockReturnValue({promise:Promise.resolve(pdf),destroy});
});
afterEach(()=>vi.unstubAllGlobals());
it('renders only page one at bounded size against white, compresses and releases resources',async()=>{
 expect(await classificationPreview(file)).toBe(image);
 expect(pdf.getPage).toHaveBeenCalledExactlyOnceWith(1);
 expect(render.mock.calls[0][0].viewport).toEqual({width:960,height:1280});
 expect(render.mock.calls[0][0].background).toBe('rgb(255,255,255)');
 expect(toDataURL).toHaveBeenCalledWith('image/jpeg',0.8);expect(destroy).toHaveBeenCalledOnce();expect(canvas.width).toBe(0);
});
it('reduces JPEG quality to stay under the payload cap',async()=>{
 toDataURL.mockReturnValueOnce('data:image/jpeg;base64,'+'x'.repeat(1_000_000));
 expect(await classificationPreview(file)).toBe(image);expect(toDataURL).toHaveBeenLastCalledWith('image/jpeg',0.6);
});
it('cleans up after rendering failures, unsupported encoders and multipage inputs',async()=>{
 render.mockReturnValueOnce({promise:Promise.reject(new Error('render failed'))});
 await expect(classificationPreview(file)).rejects.toThrow('render failed');expect(destroy).toHaveBeenCalledOnce();
 toDataURL.mockReturnValue('data:image/png;base64,test');await expect(classificationPreview(file)).rejects.toThrow('compact');
 pdf.numPages=2;await expect(classificationPreview(file)).rejects.toThrow('one page');expect(destroy).toHaveBeenCalledTimes(3);
});
