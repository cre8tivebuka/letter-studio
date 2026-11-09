import type {Letterhead} from './documents';

export type WritingRegion=Pick<Letterhead,'left'|'right'|'bodyTop'|'bodyBottom'>;
export type AreaHandle='move'|'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se';
export const PAGE_INSET=.02;
export const MIN_AREA_WIDTH=.2;
export const MIN_AREA_HEIGHT=.16;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const snap=(value:number)=>Math.round(value*1000)/1000;

// Pointer and keyboard changes use the same bounds as the margin sliders.
export function resizeWritingRegion(start:WritingRegion,handle:AreaHandle,dx:number,dy:number):WritingRegion{
 let {left,right,bodyTop,bodyBottom}=start;
 if(handle==='move'){
  const x=clamp(dx,PAGE_INSET-left,1-PAGE_INSET-right);
  const y=clamp(dy,PAGE_INSET-bodyTop,1-PAGE_INSET-bodyBottom);
  left+=x;right+=x;bodyTop+=y;bodyBottom+=y;
 }else{
  if(handle.includes('w'))left=clamp(left+dx,PAGE_INSET,right-MIN_AREA_WIDTH);
  if(handle.includes('e'))right=clamp(right+dx,left+MIN_AREA_WIDTH,1-PAGE_INSET);
  if(handle.includes('n'))bodyTop=clamp(bodyTop+dy,PAGE_INSET,bodyBottom-MIN_AREA_HEIGHT);
  if(handle.includes('s'))bodyBottom=clamp(bodyBottom+dy,bodyTop+MIN_AREA_HEIGHT,1-PAGE_INSET);
 }
 return {left:snap(left),right:snap(right),bodyTop:snap(bodyTop),bodyBottom:snap(bodyBottom)};
}
