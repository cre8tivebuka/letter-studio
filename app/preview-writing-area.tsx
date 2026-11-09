'use client';
import {useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import {Move} from 'lucide-react';
import {resizeWritingRegion,type WritingRegion,type AreaHandle} from '@/lib/writing-region';

const handles:{id:AreaHandle;label:string}[]=[
 {id:'nw',label:'top left'},{id:'n',label:'top'},{id:'ne',label:'top right'},
 {id:'e',label:'right'},{id:'se',label:'bottom right'},{id:'s',label:'bottom'},
 {id:'sw',label:'bottom left'},{id:'w',label:'left'},
];
type Drag={pointerId:number;handle:AreaHandle;start:WritingRegion;x:number;y:number;width:number;height:number};

export default function PreviewWritingArea({value,onChange,onDragging}:{value:WritingRegion;onChange:(value:WritingRegion)=>void;onDragging:(dragging:boolean)=>void}){
 const drag=useRef<Drag|null>(null);
 const [active,setActive]=useState(false);
 function begin(event:PointerEvent<HTMLDivElement>){
  if(!event.isPrimary||event.button!==0||drag.current)return;
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-handle]');
  const paper=event.currentTarget.parentElement?.getBoundingClientRect();
  if(!target||!paper?.width||!paper.height)return;
  event.preventDefault();target.focus({preventScroll:true});
  drag.current={pointerId:event.pointerId,handle:target.dataset.handle as AreaHandle,start:{...value},x:event.clientX,y:event.clientY,width:paper.width,height:paper.height};
  event.currentTarget.setPointerCapture(event.pointerId);setActive(true);onDragging(true);
 }
 function update(event:PointerEvent<HTMLDivElement>){
  const current=drag.current;if(!current||event.pointerId!==current.pointerId)return;
  event.preventDefault();
  onChange(resizeWritingRegion(current.start,current.handle,(event.clientX-current.x)/current.width,(event.clientY-current.y)/current.height));
 }
 function finish(event:PointerEvent<HTMLDivElement>,cancel=false){
  const current=drag.current;if(!current||event.pointerId!==current.pointerId)return;
  if(cancel)onChange(current.start);
  drag.current=null;setActive(false);onDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function keyboard(event:KeyboardEvent<HTMLButtonElement>,handle:AreaHandle){
  if(event.key==='Escape'&&drag.current){event.preventDefault();onChange(drag.current.start);drag.current=null;setActive(false);onDragging(false);return;}
  const step=event.shiftKey ? .05 : .01;
  const delta:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(!delta[event.key])return;
  event.preventDefault();const [x,y]=delta[event.key];onChange(resizeWritingRegion(value,handle,x,y));
 }
 return <div className={'writing-area interactive'+(active?' dragging':'')} role="group" aria-label="Writing area" style={{top:value.bodyTop*100+'%',height:(value.bodyBottom-value.bodyTop)*100+'%',left:value.left*100+'%',width:(value.right-value.left)*100+'%'}} onPointerDown={begin} onPointerMove={update} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event)}>
  <button type="button" className="area-move-surface" data-handle="move" aria-label="Move writing area" aria-describedby="area-help" onKeyDown={event=>keyboard(event,'move')}><span className="area-label"><Move size={12}/> Writing area</span></button>
  {handles.map(handle=><button key={handle.id} type="button" className={'area-handle handle-'+handle.id} data-handle={handle.id} aria-label={'Resize writing area '+handle.label} aria-describedby="area-help" onKeyDown={event=>keyboard(event,handle.id)}/>)}
 </div>;
}
