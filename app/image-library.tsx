'use client';
import {useRef,useState} from 'react';
import {ImagePlus,Move,Trash2,Check,PenLine,X} from 'lucide-react';
import {MAX_LETTER_IMAGES,type LetterImage,type ImagePages} from '@/lib/letter-images';

const pageOptions:{value:ImagePages;label:string}[]=[{value:'last',label:'Last page'},{value:'first',label:'First page'},{value:'all',label:'Every page'}];

export default function ImageLibrary({images,placing,needsHead,disabled,drawing,onDraw,onUpload,onPlace,onPages,onRemove}:{images:LetterImage[];placing:string|null;needsHead:boolean;disabled:boolean;drawing:boolean;onDraw:()=>void;onUpload:(file?:File)=>void;onPlace:(id:string)=>void;onPages:(id:string,pages:ImagePages)=>void;onRemove:(id:string)=>void}){
 const input=useRef<HTMLInputElement>(null);
 const [dragging,setDragging]=useState(false);
 const full=images.length>=MAX_LETTER_IMAGES;
 return <section className="panel image-panel" aria-labelledby="images-heading">
  <div className="section-heading"><h2 id="images-heading">Stamps &amp; signatures</h2><span className="file-type">PNG · JPG</span></div>
  <input id="image-file" ref={input} hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" aria-label="Upload stamp or signature image" onChange={e=>{onUpload(e.target.files?.[0]);e.target.value='';}}/>
  <button type="button" className={'upload-area '+(dragging?'dragging':'')} disabled={disabled||full} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);onUpload(e.dataTransfer.files[0]);}}>
   <span className="upload-icon"><ImagePlus size={23}/></span>
   <span className="upload-copy"><strong>{full?'Image limit reached':'Add a stamp or signature'}</strong><span>{needsHead?'Upload your letterhead first':full?'Remove an image to add another':'Transparent PNGs look best · Up to 5 MB'}</span></span>
  </button>
  <button type="button" className={'button secondary draw-signature'+(drawing?' active':'')} aria-pressed={drawing} disabled={disabled||(full&&!drawing)} onClick={onDraw}>{drawing?<X size={15}/>:<PenLine size={15}/>} {drawing?'Cancel drawing':'Draw your signature on the page'}</button>
  {images.length>0&&<ul className="image-list" aria-label="Your images">{images.map(image=><li key={image.id} className={placing===image.id?'placing':''}>
   <span className="image-thumb"><img src={image.url} alt=""/></span>
   <span className="image-name">{image.name}<small>{placing===image.id?'Placing on the preview…':'Placed'}</small></span>
   <select aria-label={'Pages for '+image.name} value={image.pages} disabled={disabled} onChange={e=>onPages(image.id,e.target.value as ImagePages)}>{pageOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
   <button type="button" className="icon-button" aria-label={(placing===image.id?'Done placing ':'Move ')+image.name} title={placing===image.id?'Done placing':'Move on preview'} disabled={disabled} onClick={()=>onPlace(image.id)}>{placing===image.id?<Check size={15}/>:<Move size={15}/>}</button>
   <button type="button" className="icon-button" aria-label={'Remove '+image.name} title="Remove" disabled={disabled} onClick={()=>onRemove(image.id)}><Trash2 size={15}/></button>
  </li>)}</ul>}
 </section>;
}
