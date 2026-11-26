'use client';
import {useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import {Check,Move} from 'lucide-react';
import {placeImage,imageHeight,type LetterImage,type ImageHandle} from '@/lib/letter-images';

type Position=Pick<LetterImage,'x'|'y'|'w'>;
type Drag={pointerId:number;handle:ImageHandle;start:Position;x:number;y:number;width:number;height:number};

// Mirrors the writing-area box: drag inside to move, drag the corner to resize, arrow keys nudge.
export default function PreviewImage({image,pageAspect,onChange,onDone,onDragging}:{image:LetterImage;pageAspect:number;onChange:(position:Position)=>void;onDone:()=>void;onDragging:(dragging:boolean)=>void}){
 const drag=useRef<Drag|null>(null);
 const [active,setActive]=useState(false);
 const move=(start:Position,handle:ImageHandle,dx:number,dy:number)=>onChange(placeImage({...start,aspect:image.aspect},pageAspect,handle,dx,dy));
 function begin(event:PointerEvent<HTMLDivElement>){
  if(!event.isPrimary||event.button!==0||drag.current)return;
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-image-handle]');
  const paper=event.currentTarget.parentElement?.getBoundingClientRect();
  if(!target||!paper?.width||!paper.height)return;
  event.preventDefault();target.focus({preventScroll:true});
  drag.current={pointerId:event.pointerId,handle:target.dataset.imageHandle as ImageHandle,start:{x:image.x,y:image.y,w:image.w},x:event.clientX,y:event.clientY,width:paper.width,height:paper.height};
  event.currentTarget.setPointerCapture(event.pointerId);setActive(true);onDragging(true);
 }
 function update(event:PointerEvent<HTMLDivElement>){
  const current=drag.current;if(!current||event.pointerId!==current.pointerId)return;
  event.preventDefault();
  move(current.start,current.handle,(event.clientX-current.x)/current.width,(event.clientY-current.y)/current.height);
 }
 function finish(event:PointerEvent<HTMLDivElement>,cancel=false){
  const current=drag.current;if(!current||event.pointerId!==current.pointerId)return;
  if(cancel)onChange(current.start);
  drag.current=null;setActive(false);onDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function keyboard(event:KeyboardEvent<HTMLButtonElement>,handle:ImageHandle){
  if(event.key==='Escape'&&drag.current){event.preventDefault();onChange(drag.current.start);drag.current=null;setActive(false);onDragging(false);return;}
  if(event.key==='Enter'&&handle==='move'){event.preventDefault();onDone();return;}
  const step=event.shiftKey ? .05 : .01;
  const delta:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(!delta[event.key])return;
  event.preventDefault();const [x,y]=delta[event.key];
  // The resize corner grows with right/down and shrinks with left/up.
  move({x:image.x,y:image.y,w:image.w},handle,handle==='resize'?x+y:x,y);
 }
 const height=imageHeight(image,pageAspect);
 return <div className={'placed-image interactive'+(active?' dragging':'')} role="group" aria-label={'Place '+image.name} style={{left:image.x*100+'%',top:image.y*100+'%',width:image.w*100+'%',height:height*100+'%'}} onPointerDown={begin} onPointerMove={update} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event)}>
  <img src={image.url} alt="" draggable={false}/>
  <button type="button" className="image-move-surface" data-image-handle="move" aria-label={'Move '+image.name} aria-describedby="image-help" onKeyDown={event=>keyboard(event,'move')}><span className="area-label"><Move size={12}/> Drag to place</span></button>
  <button type="button" className="area-handle image-resize-handle" data-image-handle="resize" aria-label={'Resize '+image.name} aria-describedby="image-help" onKeyDown={event=>keyboard(event,'resize')}/>
  <button type="button" className="image-done" aria-label={'Done placing '+image.name} onPointerDown={event=>event.stopPropagation()} onClick={onDone}><Check size={14}/> Done</button>
 </div>;
}
