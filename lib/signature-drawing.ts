// Freehand signatures drawn straight onto the preview page.
// Points are fractions of the page (x of width, y of height) so drawings survive resizes.
export type InkPoint={x:number;y:number;p:number};
export type InkStroke={color:string;width:number;points:InkPoint[]};
export const INK_COLORS=[{label:'Blue ink',value:'#1a2f8a'},{label:'Black ink',value:'#111418'}] as const;
/** Pen thickness as a fraction of the page width (about 1.4 pt on A4). */
export const INK_WIDTH=.0024;
const EXPORT_PAGE_WIDTH=2400;

const thickness=(stroke:InkStroke,p:number,pageWidth:number)=>stroke.width*pageWidth*(.65+.7*Math.min(1,Math.max(0,p)));

/** Draw strokes onto a canvas whose full size represents a page of pageWidth × pageHeight pixels, shifted by an offset. */
export function paintStrokes(ctx:CanvasRenderingContext2D,strokes:InkStroke[],pageWidth:number,pageHeight:number,offsetX=0,offsetY=0){
 ctx.lineCap='round';ctx.lineJoin='round';
 const at=(pt:InkPoint)=>[pt.x*pageWidth-offsetX,pt.y*pageHeight-offsetY] as const;
 for(const stroke of strokes){
  const pts=stroke.points;if(!pts.length)continue;
  ctx.strokeStyle=ctx.fillStyle=stroke.color;
  if(pts.length===1){const [x,y]=at(pts[0]);ctx.beginPath();ctx.arc(x,y,thickness(stroke,pts[0].p,pageWidth)/2,0,Math.PI*2);ctx.fill();continue;}
  // Smooth curve through segment midpoints; each piece gets its own width so pen pressure shows.
  for(let i=1;i<pts.length;i++){
   const [px,py]=at(pts[i-1]),[cx,cy]=at(pts[i]);
   const start=i===1?[px,py]:[(px+at(pts[i-2])[0])/2,(py+at(pts[i-2])[1])/2];
   const mid=i===pts.length-1?[cx,cy]:[(px+cx)/2,(py+cy)/2];
   ctx.beginPath();ctx.moveTo(start[0],start[1]);ctx.quadraticCurveTo(px,py,mid[0],mid[1]);
   ctx.lineWidth=thickness(stroke,(pts[i-1].p+pts[i].p)/2,pageWidth);ctx.stroke();
  }
 }
}

/** Crop the drawing to its own bounds and return a transparent PNG plus where it sits on the page. */
export async function exportSignature(strokes:InkStroke[],pageAspect:number){
 const points=strokes.flatMap(s=>s.points);if(!points.length)throw new Error('Draw your signature first.');
 const W=EXPORT_PAGE_WIDTH,H=W*pageAspect;
 const pad=Math.max(...strokes.map(s=>s.width))*W*1.5+4;
 const xs=points.map(p=>p.x*W),ys=points.map(p=>p.y*H);
 const left=Math.max(0,Math.min(...xs)-pad),top=Math.max(0,Math.min(...ys)-pad);
 const right=Math.min(W,Math.max(...xs)+pad),bottom=Math.min(H,Math.max(...ys)+pad);
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(right-left));canvas.height=Math.max(1,Math.ceil(bottom-top));
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser cannot prepare this signature.');
 paintStrokes(ctx,strokes,W,H,left,top);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Unable to prepare this signature.')),'image/png'));
 return {blob,aspect:canvas.height/canvas.width,x:left/W,y:top/H,w:canvas.width/W};
}
