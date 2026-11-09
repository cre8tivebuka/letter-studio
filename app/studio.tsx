'use client';
import {useEffect,useRef,useState} from 'react';
import {FileText,Upload,Download,Check,ChevronLeft,ChevronRight,Scan} from 'lucide-react';
import DocumentEditor from './document-editor';
import WritingArea from './writing-area';
import PreviewWritingArea from './preview-writing-area';
import FontLibrary from './font-library';
import {type CustomFont,fontAlias} from '@/lib/custom-fonts';
import type {Letterhead} from '@/lib/documents';
import {assetUrl} from '@/lib/assets';

type Head = Letterhead & {name:string};
type Draft = {head:Head|null;title:string;text:string;html:string;fontSize:number;fontFamily:string};
type Preview = {source:Draft;blob:Blob;url:string;pageCount:number;bytes:number};
const initialDraft:Draft={head:null,title:'My letter',text:'',html:'',fontSize:11,fontFamily:'Arial'};

export default function Studio(){
 const [draft,setDraft]=useState<Draft>(initialDraft);
 const [fonts,setFonts]=useState<CustomFont[]>([]),[fontsOpen,setFontsOpen]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null),[previewing,setPreviewing]=useState(false);
 const [page,setPage]=useState(1),[pageImage,setPageImage]=useState<{dataUrl:string;headUrl:string;page:number;source:Draft}|null>(null),[thumbnails,setThumbnails]=useState<string[]>([]);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[previewError,setPreviewError]=useState(''),[notice,setNotice]=useState('');
 const [marginsOpen,setMarginsOpen]=useState(false),[dragging,setDragging]=useState(false);
 const [resizing,setResizing]=useState(false);
 const headInput=useRef<HTMLInputElement>(null),wordInput=useRef<HTMLInputElement>(null);
 const {head,title,text,html,fontSize,fontFamily}=draft;
 const rendered=pageImage?.source===draft&&pageImage?.page===page;
 const updating=previewing||!!(preview?.source===draft&&!rendered);
 const ready=preview?.source===draft&&rendered&&!resizing?preview:null;
 const visibleImage=pageImage?.headUrl===head?.fileUrl&&pageImage?.page===page?pageImage.dataUrl:'';
 const patch=(change:Partial<Draft>)=>setDraft(current=>(Object.keys(change) as (keyof Draft)[]).every(key=>current[key]===change[key])?current:{...current,...change});

 useEffect(()=>()=>{if(head)URL.revokeObjectURL(head.fileUrl);},[head?.fileUrl]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 useEffect(()=>{
  let active=true;
  setPreviewError('');
  if(!draft.head||!draft.text.trim()){setPreview(null);setPageImage(null);setThumbnails([]);setPreviewing(false);return;}
  setPreviewing(true);
  const timer=setTimeout(async()=>{
   try{
    const docs=await import('@/lib/documents');
    const generated=await docs.generateLetterPdf({title:draft.title,text:draft.text,html:draft.html,template:draft.head!,fontSize:draft.fontSize,fontFamily:draft.fontFamily});
    if(active){setPreview({...generated,source:draft,url:URL.createObjectURL(generated.blob)});setPage(p=>Math.min(p,generated.pageCount));}
   }catch(e){if(active)setPreviewError((e as Error).message);}
   finally{if(active)setPreviewing(false);}
  },250);
  return()=>{active=false;clearTimeout(timer);};
 },[draft]);
 useEffect(()=>{
  let active=true;
  if(preview)import('@/lib/documents').then(d=>d.renderPdfPage(preview.blob,page)).then(result=>{if(active)setPageImage({dataUrl:result.dataUrl,headUrl:preview.source.head!.fileUrl,page,source:preview.source});}).catch(e=>{if(active)setPreviewError(e.message);});
  return()=>{active=false;};
 },[preview,page]);
 useEffect(()=>{
  let active=true;
  if(preview)import('@/lib/documents').then(d=>d.renderPdfThumbnails(preview.blob)).then(images=>{if(active)setThumbnails(images);}).catch(e=>{if(active)setPreviewError(e.message);});
  return()=>{active=false;};
 },[preview]);

 async function uploadHead(file?:File){
  if(!file||busy)return;
  setBusy('Opening letterhead…');setError('');setNotice('');
  try{
   if(!/\.pdf$/i.test(file.name))throw new Error('Choose an empty PDF letterhead.');
   const docs=await import('@/lib/documents');const prepared=await docs.prepareLetterhead(file);
   patch({head:{name:file.name,fileUrl:prepared.previewUrl,width:prepared.width,height:prepared.height,bodyTop:.2,bodyBottom:.88,left:.1,right:.9,clearBody:false}});
   setPage(1);
   if(prepared.pages>1)setNotice('The first page of your PDF is used as the letterhead on every page.');
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 async function uploadWord(file?:File){
  if(!file||busy)return;
  setBusy('Opening Word document…');setError('');setNotice('');
  try{
   if(!/\.docx$/i.test(file.name))throw new Error('Choose a Word .docx file. Save older .doc files as .docx first.');
   const docs=await import('@/lib/documents');const content=await docs.extractLetterText(file);
   patch({text:content,html:'',title:file.name.replace(/\.docx$/i,'')});setPage(1);
   setNotice('Word text imported. You can edit and format it below.');
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 function updateFonts(next:CustomFont[]){
  setFonts(next);
  if(fontFamily.startsWith('LS_')&&!next.some(font=>fontAlias(font.id)===fontFamily))patch({fontFamily:'Arial'});
 }
 const filename=(title.trim()||'Letter').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,120)+'.pdf';
 const wordCount=text.trim()?text.trim().split(/\s+/).length:0;

 return <div className="studio">
  <header className="brand-header"><h1 className="brand-logo"><span className="brand-logo-window"><img src={assetUrl('brand/letter-studio.png')} alt="Letter Studio" width={1254} height={1254}/></span></h1></header>
  <main className="studio-grid">
   <div className="editing-column">
    <section className="panel letterhead-panel" aria-labelledby="letterhead-heading">
     <div className="section-heading"><h2 id="letterhead-heading">Your letterhead</h2><span className="file-type">PDF</span></div>
     <input id="letterhead-file" ref={headInput} hidden type="file" accept=".pdf,application/pdf" aria-label="Upload empty PDF letterhead" onChange={e=>{void uploadHead(e.target.files?.[0]);e.target.value='';}}/>
     <button className={'upload-area '+(head?'has-file ':'')+(dragging?'dragging':'')} disabled={!!busy} onClick={()=>headInput.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void uploadHead(e.dataTransfer.files[0]);}}>
      <span className="upload-icon">{head?<Check size={23}/>:<Upload size={23}/>}</span>
      <span className="upload-copy"><strong>{head?head.name:'Upload an empty PDF letterhead'}</strong><span>{head?'Click to replace your PDF':'Choose a file or drop it here · Up to 20 MB'}</span></span>
     </button>
     {head&&<WritingArea value={head} open={marginsOpen} onChange={region=>patch({head:{...head,...region}})} onToggle={setMarginsOpen}/>}
    </section>
    <section className="panel letter-panel" aria-labelledby="letter-heading">
     <div className="section-heading"><h2 id="letter-heading">Your letter</h2><button className="button secondary import-word" disabled={!!busy} onClick={()=>wordInput.current?.click()}><Upload size={15}/> Import Word</button></div>
     <input id="word-file" ref={wordInput} hidden type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Import Word document" onChange={e=>{void uploadWord(e.target.files?.[0]);e.target.value='';}}/>
     <p className="section-description">Type below, paste your text, or import a Word document.</p>
     <div className="title-field"><label htmlFor="letter-title">Document name</label><input id="letter-title" value={title} maxLength={120} onChange={e=>patch({title:e.target.value})} placeholder="My letter"/></div>
     <DocumentEditor text={text} html={html} fontSize={fontSize} fontFamily={fontFamily} onChange={(text,html)=>patch({text,html})} onSize={fontSize=>patch({fontSize})} onFamily={fontFamily=>patch({fontFamily})} fonts={fonts} onFonts={()=>setFontsOpen(true)}/>
     <div className="editor-meta"><span>{wordCount} word{wordCount===1?'':'s'}</span><span>All pages in one PDF</span></div>
    </section>
    {busy&&<p className="notice" role="status">{busy}</p>}
    {notice&&<p className="notice" role="status"><Check size={16}/>{notice}</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
   </div>
   <section className="preview-column" aria-labelledby="preview-heading">
    <div className="preview-heading"><h2 id="preview-heading">Preview</h2><span className="preview-status" role="status">{resizing?'Adjusting writing area…':updating?'Updating…':ready?ready.pageCount+' page'+(ready.pageCount===1?'':'s')+' · '+Math.ceil(ready.bytes/1000)+' KB':'Ready when you are'}</span></div>
    {head&&<div className="preview-tools"><button className={'button preview-area-toggle'+(marginsOpen?' active':'')} aria-label="Edit writing area in preview" aria-pressed={marginsOpen} onClick={()=>setMarginsOpen(open=>!open)}>{marginsOpen?<Check size={15}/>:<Scan size={15}/>} {marginsOpen?'Done adjusting':'Adjust writing area'}</button><span>{marginsOpen?'Drag the edges or corners to resize':'Set your text area on the page'}</span></div>}
    <div className="preview-stage" aria-busy={updating}>
     <div className="paper" style={{aspectRatio:head?head.width+' / '+head.height:'210 / 297'}}>
      {head?<img src={visibleImage||head.fileUrl} alt={visibleImage?'Generated letter, page '+page:'Uploaded empty letterhead'} className="paper-image" draggable={false}/>:<div className="paper-placeholder"><div className="placeholder-sheet"><FileText size={36} strokeWidth={1.2}/></div><strong>Your letter starts here</strong><p>Upload your empty letterhead<br/>to see the finished pages.</p></div>}
      {head&&marginsOpen&&<PreviewWritingArea value={head} onChange={region=>patch({head:{...head,...region}})} onDragging={setResizing}/>}
     </div>
    </div>
    {head&&marginsOpen&&<p id="area-help" className="area-help">Drag inside the box to move it. Arrow keys nudge a focused handle; hold Shift for larger steps. Applies to every page.</p>}
    {preview&&thumbnails.length>1&&<div className="page-thumbnails" aria-label="Document pages">{thumbnails.map((src,index)=><button key={index} disabled={!ready} className={page===index+1?'active':''} aria-label={'Go to page '+(index+1)} aria-current={page===index+1?'page':undefined} onClick={()=>setPage(index+1)}><img src={src} alt=""/><span>{index+1}</span></button>)}</div>}
    {preview&&preview.pageCount>1&&<div className="page-navigation"><button className="icon-button" aria-label="Previous page" disabled={!ready||page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><span>Page {page} of {preview.pageCount}</span><button className="icon-button" aria-label="Next page" disabled={!ready||page===preview.pageCount} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div>}
    {previewError&&<p className="notice error" role="alert">{previewError}</p>}
    {ready?<a className="button primary download-button" href={ready.url} download={filename}><Download size={18}/> Download PDF</a>:<button className="button primary download-button" disabled><Download size={18}/>{updating?'Preparing PDF…':'Download PDF'}</button>}
    <p className="download-hint">{!head?'Add your letterhead to get started.':!text.trim()?'Add your words to create the PDF.':'Extra pages are added automatically as you write.'}</p>
   </section>
  </main>
  <footer className="studio-footer">Built by <strong>cre8tivebuka</strong></footer>
  <FontLibrary open={fontsOpen} onClose={()=>setFontsOpen(false)} fonts={fonts} onFonts={updateFonts} onSelect={fontFamily=>patch({fontFamily})}/>
 </div>;
}
