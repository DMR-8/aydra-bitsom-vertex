/** A4 portrait, allowing up to 5 mm variation on each dimension. */
export const A4_PAGE_SIZE = { width: 210 * 72 / 25.4, height: 297 * 72 / 25.4 };
export function isSupportedPageSize(widthPt: number, heightPt: number): boolean {
  const widthMm = widthPt * 25.4 / 72;
  const heightMm = heightPt * 25.4 / 72;
  return Number.isFinite(widthMm) && Number.isFinite(heightMm)
    && Math.abs(widthMm - 210) <= 5 + 1e-7
    && Math.abs(heightMm - 297) <= 5 + 1e-7;
}

export const isPamphletPageCount = (count: number) => count === 1 || count === 2;
export type PamphletFamily = 'half' | 'full';
export interface PamphletPaper {
  family: PamphletFamily;
  name: string;
  /** Dimensions in portrait reading orientation, without scaling. */
  widthMm: number;
  heightMm: number;
  toPortrait: 0 | 90;
}
export function classifyPamphletPaper(widthPt: number, heightPt: number): PamphletPaper | null {
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) return null;
  const widthMm = Math.min(widthPt,heightPt)*25.4/72;
  const heightMm = Math.max(widthPt,heightPt)*25.4/72;
  const sizes = [
    {family:'half' as const,name:'A5',width:148,height:210},
    {family:'half' as const,name:'8.5 × 5.5 in',width:139.7,height:215.9},
    {family:'full' as const,name:'A4',width:210,height:297},
    {family:'full' as const,name:'8.5 × 11 in',width:215.9,height:279.4},
  ];
  const match=sizes.filter(s=>Math.abs(widthMm-s.width)<=5+1e-7 && Math.abs(heightMm-s.height)<=5+1e-7)
    .sort((a,b)=>(widthMm-a.width)**2+(heightMm-a.height)**2-((widthMm-b.width)**2+(heightMm-b.height)**2))[0];
  return match ? {family:match.family,name:match.name,widthMm,heightMm,toPortrait:widthPt>heightPt?90:0} : null;
}
