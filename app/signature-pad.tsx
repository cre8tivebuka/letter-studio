'use client';
import {useEffect,useRef,type PointerEvent} from 'react';
import {paintStrokes,INK_WIDTH,type InkStroke,type InkPoint} from '@/lib/signature-drawing';

// A transparent drawing surface laid over the preview paper. Works with mouse, finger, and pen (with pressure).
export default function SignaturePad({strokes,color,onStrokes}:{strokes:InkStroke[];color:string;onStrokes:(strokes:InkStroke[])=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const current=useRef<{pointerId:number;stroke:InkStroke}|null>(null);
 const latest=useRef(strokes);latest.current=strokes;
 function paint(){
  const el=canvas.current;const ctx=el?.getContext('2d');if(!el||!ctx)return;
  ctx.clearRect(0,0,el.width,el.height);
  paintStrokes(ctx,current.current?[...latest.current,current.current.stroke]:latest.current,el.width,el.height);
 }
 // Keep the canvas sharp at any size and pixel density.
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const fit=()=>{const ratio=Math.min(3,window.devicePixelRatio||1);el.width=Math.max(1,Math.round(el.clientWidth*ratio));el.height=Math.max(1,Math.round(el.clientHeight*ratio));paint();};
  fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();
 },[]);
 useEffect(paint,[strokes]);
 function point(event:PointerEvent<HTMLCanvasElement>|globalThis.PointerEvent):InkPoint{
  const box=canvas.current!.getBoundingClientRect();
  const x=Math.min(1,Math.max(0,(event.clientX-box.left)/box.width)),y=Math.min(1,Math.max(0,(event.clientY-box.top)/box.height));
  return {x,y,p:event.pointerType==='pen'&&event.pressure>0?event.pressure:.5};
 }
 function begin(event:PointerEvent<HTMLCanvasElement>){
  if(!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0)||current.current)return;
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
  current.current={pointerId:event.pointerId,stroke:{color,width:INK_WIDTH,points:[point(event)]}};paint();
 }
 function move(event:PointerEvent<HTMLCanvasElement>){
  const active=current.current;if(!active||event.pointerId!==active.pointerId)return;
  event.preventDefault();
  const events=event.nativeEvent.getCoalescedEvents?.()??[];
  for(const e of events.length?events:[event.nativeEvent])active.stroke.points.push(point(e));
  paint();
 }
 function end(event:PointerEvent<HTMLCanvasElement>){
  const active=current.current;if(!active||event.pointerId!==active.pointerId)return;
  current.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  onStrokes([...latest.current,active.stroke]);
 }
 return <canvas ref={canvas} className="signature-pad" role="img" aria-label="Signature drawing area. Draw with your mouse, finger, or pen." onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/>;
}
