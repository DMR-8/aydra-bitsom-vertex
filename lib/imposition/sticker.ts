import type { ImpositionPlan, PlacedPage } from './layout';
import type { PageSize } from './types';

export const STICKER_SETTINGS = { width:330.2, height:482.6, margin:8, corner:15, gap:2 } as const;
/** Compare uniform grids and every two-orientation row/column band combination.
 * Centre each band and the whole block before checking the four keep-out squares.
 * This bounded shelf search improves yield; it is not an arbitrary-packing proof.
 */
export function planSticker(size: PageSize): ImpositionPlan {
  const {width:W,height:H,margin:m,corner:c,gap:g}=STICKER_SETTINGS;
  const w=size.width*25.4/72,h=size.height*25.4/72;
  const plan: ImpositionPlan={sheetWidthMm:W,sheetHeightMm:H,marginMm:m,cornerMm:c,sheets:[],error:null,warnings:[],summary:''};
  if (![w,h].every(n=>Number.isFinite(n)&&n>0)) return {...plan,error:'The sticker page must have positive dimensions.'};
  if (w*h<15) return {...plan,error:'Sticker pages must have an area of at least 15 mm².'};
  let best: PlacedPage[]=[];
  const fit=(length:number,item:number)=>Math.max(0,Math.floor((length+g+1e-8)/(item+g)));
  for(const transpose of [false,true]) for(const inset of [m,c]) {
    const sw=transpose?H:W,sh=transpose?W:H;
    const iw=transpose?h:w,ih=transpose?w:h;
    const cols=[fit(sw-2*inset,iw),fit(sw-2*inset,ih)];
    for(let a=0;a<=(cols[0]?fit(sh-2*inset,ih):0);a++) for(let b=0;b<=(cols[1]?fit(sh-2*inset,iw):0);b++) {
      if(!a&&!b || a&&!cols[0] || b&&!cols[1]) continue;
      const bh=a*(ih+g)+b*(iw+g)-g;
      if(bh>sh-2*inset+1e-8 || a*cols[0]+b*cols[1]<=best.length) continue;
      // Split the first orientation equally around the other to preserve centred bounds.
      for(const order of [[a,b,0],[0,b,a],[Math.floor(a/2),b,Math.ceil(a/2)]]) {
        const slots:PlacedPage[]=[];
        let y=(sh-bh)/2;
        for(let band=0;band<3;band++) {
          const turn=band===1, cw=turn?ih:iw,ch=turn?iw:ih,n=cols[turn?1:0];
          for(let row=0;row<order[band];row++,y+=ch+g) for(let col=0;col<n;col++) {
            const x=(sw-(n*cw+(n-1)*g))/2+col*(cw+g);
            slots.push({page:1,x:transpose?y:x,y:transpose?x:y,width:transpose?ch:cw,height:transpose?cw:ch,rotation:turn?90:0,rotated:false});
          }
        }
        // Reject a candidate if removing corner collisions would shift its centred bounds.
        const clean=slots.filter(s=>!((s.x<c-1e-7||s.x+s.width>W-c+1e-7)&&(s.y<c-1e-7||s.y+s.height>H-c+1e-7)));
        if(clean.length<=best.length) continue;
        const left=Math.min(...clean.map(s=>s.x)),right=Math.max(...clean.map(s=>s.x+s.width));
        const top=Math.min(...clean.map(s=>s.y)),bottom=Math.max(...clean.map(s=>s.y+s.height));
        if(Math.abs(left+right-W)<1e-6&&Math.abs(top+bottom-H)<1e-6) best=clean;
      }
    }
  }
  plan.error=best.length?null:'This sticker does not fit the sheet with the fixed margins and corner clearance.';
  plan.sheets=best.length?[{label:'Labels / Stickers',side:'front',stickerMarks:true,slots:best}]:[];
  plan.summary=`${best.length} stickers per 13 × 19 inch sheet · ${new Set(best.map(s=>s.rotation)).size>1?'Mixed orientations':'Uniform orientation'} · actual source size.`;
  return plan;
}
