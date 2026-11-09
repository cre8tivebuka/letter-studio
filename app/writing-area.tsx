'use client';
import {ChevronDown,RotateCcw,SlidersHorizontal} from 'lucide-react';
import type {Letterhead} from '@/lib/documents';
import {PAGE_INSET,MIN_AREA_WIDTH,MIN_AREA_HEIGHT} from '@/lib/writing-region';

export default function WritingArea({value,open,onChange,onToggle}:{value:Letterhead;open:boolean;onChange:(region:Partial<Letterhead>)=>void;onToggle:(open:boolean)=>void}){
 const margins=[
  {label:'Top',key:'bodyTop',value:value.bodyTop,max:(value.bodyBottom-MIN_AREA_HEIGHT)*100},
  {label:'Bottom',key:'bodyBottom',value:1-value.bodyBottom,max:(1-value.bodyTop-MIN_AREA_HEIGHT)*100},
  {label:'Left',key:'left',value:value.left,max:(value.right-MIN_AREA_WIDTH)*100},
  {label:'Right',key:'right',value:1-value.right,max:(1-value.left-MIN_AREA_WIDTH)*100},
 ] as const;
 return <details open={open} className="margin-settings" onToggle={e=>onToggle(e.currentTarget.open)}>
  <summary>
   <span className="margin-trigger-icon"><SlidersHorizontal size={19}/></span>
   <span className="margin-trigger-copy"><strong>Adjust writing area</strong><span>Make room for your header and footer</span></span>
   <ChevronDown size={18} className="margin-chevron"/>
  </summary>
  <div className="margin-content">
   <div className="margin-intro">
    <div className="margin-diagram" aria-hidden="true"><span className="diagram-header"/><span className="diagram-footer"/><div className="diagram-text" style={{top:value.bodyTop*100+'%',bottom:(1-value.bodyBottom)*100+'%',left:value.left*100+'%',right:(1-value.right)*100+'%'}}><i/><i/><i/><i/></div></div>
    <div><h3>Your text stays in the blue area</h3><p>Use these sliders or drag the box directly on your PDF preview.</p><button type="button" className="reset-margins" onClick={()=>onChange({bodyTop:.2,bodyBottom:.88,left:.1,right:.9})}><RotateCcw size={13}/> Reset margins</button></div>
   </div>
   <div className="margin-grid">{margins.map(item=><label className="margin-control" key={item.key}>
    <span className="margin-label">{item.label}</span><span className="margin-value">{Math.round(item.value*1000)/10}<small>%</small></span>
    <input aria-label={item.label+' margin'} type="range" min={PAGE_INSET*100} max={Math.round(item.max*10)/10} step={.1} value={Math.round(item.value*1000)/10} aria-valuetext={Math.round(item.value*1000)/10+' percent'} onChange={e=>onChange({[item.key]:item.key==='bodyBottom'||item.key==='right'?1-Number(e.target.value)/100:Number(e.target.value)/100})}/>
   </label>)}</div>
  </div>
 </details>;
}
