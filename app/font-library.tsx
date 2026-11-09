'use client';
import {useEffect,useRef,useState} from 'react';
import {Upload,Link,Trash2,X,Check,ArrowUpRight,Type,LoaderCircle} from 'lucide-react';
import {type CustomFont,fontAlias,fetchFont,inspectFont,registerCustomFont,forgetCustomFont} from '@/lib/custom-fonts';

export default function FontLibrary({open,onClose,fonts,onFonts,onSelect}:{open:boolean;onClose:()=>void;fonts:CustomFont[];onFonts:(fonts:CustomFont[])=>void;onSelect:(alias:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),fileInput=useRef<HTMLInputElement>(null),operation=useRef(false);
 const [name,setName]=useState(''),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dragging,setDragging]=useState(false);
 useEffect(()=>{if(open){dialog.current?.showModal();setError('');}else dialog.current?.close();},[open]);
 async function add(data:Uint8Array){
  const info=await inspectFont(data);
  const font:CustomFont={id:crypto.randomUUID(),name:name.trim()||info.name,format:info.format,bytes:data.length,temporary:true};
  const alias=await registerCustomFont(font,data);onFonts([font,...fonts]);onSelect(alias);
  setName('');setUrl('');setNotice(font.name+' is ready to use.');
 }
 async function run(task:()=>Promise<void>){
  if(operation.current)return;
  operation.current=true;setBusy(true);setError('');setNotice('');
  try{await task();}catch(e){setError((e as Error).message);}finally{operation.current=false;setBusy(false);}
 }
 async function upload(file?:File){
  if(!file)return;
  await run(async()=>{if(file.size>5_000_000)throw new Error('Choose a font smaller than 5 MB.');await add(new Uint8Array(await file.arrayBuffer()));});
 }
 async function online(){
  await run(async()=>{
   let target:URL;try{target=new URL(url);}catch{throw new Error('Enter a direct HTTPS link to a .ttf or .otf file.');}
   if(target.protocol!=='https:'||target.username||target.password)throw new Error('Use an HTTPS font-file URL.');
   let bytes;try{bytes=await fetchFont(target.href);}catch{throw new Error('This source could not be downloaded, or it blocks browser access. Download its TTF/OTF file and upload it here instead.');}
   await add(bytes);
  });
 }
 function remove(font:CustomFont){
  if(operation.current)return;
  forgetCustomFont(font.id);onFonts(fonts.filter(f=>f.id!==font.id));setNotice('Font removed. Downloaded PDFs keep their embedded fonts.');
 }
 return <dialog ref={dialog} className="font-dialog font-manager" aria-labelledby="fonts-heading" aria-describedby="fonts-description" onCancel={onClose}>
  <div className="font-manager-header">
   <span className="font-manager-symbol" aria-hidden="true">Aa</span>
   <div><h2 id="fonts-heading">Add your fonts</h2><p id="fonts-description">Give your letters a typeface of their own.</p></div>
   <button type="button" className="icon-button" aria-label="Close fonts" onClick={onClose}><X size={18}/></button>
  </div>
  <div className="font-manager-body" aria-busy={busy}>
   <input id="font-file" hidden ref={fileInput} type="file" accept=".ttf,.otf" aria-label="Upload font file" disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
   <button type="button" className={'font-dropzone'+(dragging?' is-dragging':'')} disabled={busy} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(e.dataTransfer.files[0]);}}>
    <span className="font-drop-icon">{busy?<LoaderCircle size={22} className="font-loading"/>:<Upload size={22}/>}</span>
    <strong>{busy?'Preparing your font…':'Drop your font file here'}</strong>
    <span className="font-drop-action">{busy?'Checking the file and PDF support':'or browse files'}{!busy&&<ArrowUpRight size={13}/>}</span>
    <span className="font-drop-types"><span>TTF</span><span>OTF</span><small>Up to 5 MB</small></span>
   </button>
   <div className="font-name-field"><label htmlFor="font-name">Display name <span>(optional)</span></label><input id="font-name" maxLength={100} disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="We’ll use the name in your font file"/></div>
   <div className="font-link-panel"><label htmlFor="font-url"><Link size={15}/> Or use a direct font-file link</label><div><input id="font-url" type="url" disabled={busy} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/font.ttf" onKeyDown={e=>{if(e.key==='Enter'&&url.trim()&&!busy){e.preventDefault();void online();}}}/><button type="button" className="button secondary" disabled={busy||!url.trim()} onClick={online}>Import<ArrowUpRight size={14}/></button></div></div>
   {error&&<p className="notice error" role="alert">{error}</p>}
   {notice&&<p className="notice" role="status"><Check size={15}/>{notice}</p>}
   {busy&&<p role="status" className="font-progress">Preparing font…</p>}
   <section className="font-collection" aria-labelledby="font-collection-heading">
    <div className="font-collection-heading"><h3 id="font-collection-heading">Your fonts</h3><span>{fonts.length}</span></div>
    {!fonts.length?<div className="font-collection-empty"><Type size={21}/><div><strong>Your collection starts here</strong><p>Upload Argentum Sans, Peugeot New, Creato Display, or your own typeface.</p></div></div>:<div className="font-cards">{fonts.map(font=><article className="font-card" key={font.id}>
     <div className="font-card-top"><div><h4>{font.name}</h4><span>{font.format.toUpperCase()} · {Math.ceil(font.bytes/1000)} KB</span></div><button type="button" className="icon-button font-remove" aria-label={'Remove '+font.name} disabled={busy} onClick={()=>remove(font)}><Trash2 size={15}/></button></div>
     <p className="font-specimen" style={{fontFamily:fontAlias(font.id)+', sans-serif'}}>Your words. Your letterhead.</p>
     <div className="font-card-bottom"><span>Aa Bb Cc · 123</span><button type="button" className="button secondary" disabled={busy} onClick={()=>run(async()=>{onSelect(await registerCustomFont(font));onClose();})}>Use font<Check size={13}/></button></div>
    </article>)}</div>}
   </section>
  </div>
  <p className="font-manager-note">Static TTF or OTF fonts only. Use fonts you can embed in PDFs. Fonts stay in this session; your downloaded PDF keeps them. Upload each weight separately for its original design.</p>
 </dialog>;
}
