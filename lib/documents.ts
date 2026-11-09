import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, setTextRenderingMode, TextRenderingMode, setLineWidth, setStrokingRgbColor } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {customFontBytes} from './custom-fonts';
import {richLines} from './rich-text';
import {assetUrl} from './assets';

export type Letterhead = { fileUrl: string; width: number; height: number; bodyTop: number; bodyBottom: number; left: number; right: number; clearBody: boolean };
export type Region = Pick<Letterhead, 'bodyTop'|'bodyBottom'|'left'|'right'|'clearBody'>;
const MAX_FILE = 20 * 1024 * 1024;
let fontPromise: Promise<ArrayBuffer> | undefined;

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = assetUrl('pdf.worker.min.mjs');
  return lib;
}
function validateFile(file: File) {
  if (!file.size) throw new Error('This file is empty. Please choose another file.');
  if (file.size > MAX_FILE) throw new Error('Please use a file smaller than 20 MB.');
}
async function imageFrom(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try { return await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('This image could not be opened.')); img.src = url; }); }
  finally { URL.revokeObjectURL(url); }
}
function toBlob(canvas: HTMLCanvasElement, quality = .9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to prepare this image.')), 'image/jpeg', quality));
}
function canvasFor(width: number, height: number) {
  const c = document.createElement('canvas'); c.width = Math.round(width); c.height = Math.round(height);
  const ctx = c.getContext('2d'); if (!ctx) throw new Error('Your browser cannot render this document.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height); return {canvas:c, ctx};
}
export async function prepareLetterhead(file: File) {
  validateFile(file);
  let canvas: HTMLCanvasElement; let pages = 1;
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const lib = await pdfjs(); const pdf = await lib.getDocument({data:await file.arrayBuffer()}).promise;
    try { pages = pdf.numPages; const page = await pdf.getPage(1); const base = page.getViewport({scale:1}); const viewport = page.getViewport({scale: Math.min(1600/base.width,2200/base.height)}); canvas = canvasFor(viewport.width,viewport.height).canvas;
      await page.render({canvas,viewport}).promise;
    } finally { await pdf.destroy(); }
  } else {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PDF, PNG, JPG, or WebP letterhead. Export Word letterheads as PDF first.');
    const img = await imageFrom(file);
    if (img.width * img.height > 60000000) throw new Error('This image is too large. Please export a smaller version.');
    const scale = Math.min(1,1600/img.width,2200/img.height); const c = canvasFor(img.width*scale,img.height*scale); canvas = c.canvas; c.ctx.drawImage(img,0,0,canvas.width,canvas.height);
  }
  const blob = await toBlob(canvas);
  return {blob,width:canvas.width,height:canvas.height,previewUrl:URL.createObjectURL(blob),pages};
}
export async function cleanLetterhead(blob: Blob, region: Region) {
  if (!region.clearBody) return blob;
  const img = await imageFrom(blob); const {canvas,ctx} = canvasFor(img.width,img.height); ctx.drawImage(img,0,0);
  ctx.fillStyle = '#fff'; ctx.fillRect(Math.floor(region.left*canvas.width), Math.floor(region.bodyTop*canvas.height), Math.ceil((region.right-region.left)*canvas.width), Math.ceil((region.bodyBottom-region.bodyTop)*canvas.height));
  return toBlob(canvas);
}
export async function extractLetterText(file: File): Promise<string> {
  validateFile(file); let text = '';
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import('mammoth'); const result = await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}); text = result.value;
  } else if (/\.pdf$/i.test(file.name)) {
    const lib = await pdfjs(); const pdf = await lib.getDocument({data:await file.arrayBuffer()}).promise;
    try {
      if (pdf.numPages > 30) throw new Error('Please upload a letter of 30 pages or fewer.');
      const pages:string[] = [];
      for(let p=1;p<=pdf.numPages;p++) {
        const page = await pdf.getPage(p); const content = await page.getTextContent(); let str = ''; let lastY:number|undefined;
        for(const item of content.items) if ('str' in item) {
          const y = item.transform[5]; if(lastY!==undefined && Math.abs(lastY-y)>3 && !str.endsWith('\n')) str += '\n';
          str += item.str + (item.hasEOL?'\n':' '); lastY=y;
        }
        if(!str.trim()) throw new Error(`Page ${p} appears to be scanned. Text recognition is not available yet; paste or type this letter instead.`);
        pages.push(str.trim());
      }
      text=pages.join('\n\n');
    } finally { await pdf.destroy(); }
  } else if (/\.txt$/i.test(file.name)) text = await file.text();
  else throw new Error('Choose a Word (.docx), text-based PDF, or TXT file.');
  if(!text.trim()) throw new Error('No text was found. Please paste or type the letter instead.');
  if(text.length>100000) throw new Error('This letter is too long. Please keep it below 100,000 characters.');
  return text.trim();
}
export async function generateLetterPdf({title,text,template,fontSize=11,lineHeight=1.5,html,fontFamily='Arial'}:{title:string;text:string;template:Letterhead;fontSize?:number;lineHeight?:number;html?:string;fontFamily?:string}) {
  if(!text.trim()) throw new Error('Add your letter text before creating a PDF.');
  if(text.length>100000) throw new Error('This letter is too long.');
  if(!(template.right>template.left && template.bodyBottom>template.bodyTop) || template.bodyTop<0 || template.bodyBottom>1 || template.left<0 || template.right>1) throw new Error('Please check the letterhead writing area.');
  if(fontSize<8 || fontSize>18 || lineHeight<1 || lineHeight>2) throw new Error('Please check the text size and line spacing.');
  const res = await fetch(template.fileUrl); if(!res.ok) throw new Error('The letterhead could not be loaded. Please upload the PDF again.');
  const source=await res.blob(); const clean=await cleanLetterhead(source,template); const img=await imageFrom(clean);
  fontPromise ??= fetch(assetUrl('fonts/NotoSans-Regular.ttf')).then(r=>{if(!r.ok) throw new Error('The document font could not load.'); return r.arrayBuffer();}).catch(e=>{fontPromise=undefined;throw e;});
  const fontBytes = await fontPromise;
  const customBytes=customFontBytes(fontFamily);
  // All attempts reuse the full-resolution letterhead. Text remains vector-based.
  for(const quality of [.92,.82,.72,.62]) {
    const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit); const font=await pdf.embedFont(fontBytes,{subset:true});
    const {canvas,ctx}=canvasFor(img.width,img.height); ctx.drawImage(img,0,0); const background=await pdf.embedJpg(await (await toBlob(canvas,quality)).arrayBuffer());
    const width=595.28; const height=width*template.height/template.width;
    if(height<width*.7||height>width*2) throw new Error('Please use a portrait or standard landscape letterhead.');
    const x=width*template.left; const maxWidth=width*(template.right-template.left); const leading=fontSize*lineHeight;
    const top=height*(1-template.bodyTop)-fontSize; const bottom=height*(1-template.bodyBottom);
    if(top-bottom<leading) throw new Error('The writing area is too small for this font size.');
    const customFont=customBytes?await pdf.embedFont(customBytes,{subset:true}):undefined;
    const lines=await richLines(pdf,font,{html,text,family:fontFamily,size:fontSize,width:maxWidth,customFont});
    let page=pdf.addPage([width,height]);page.drawImage(background,{x:0,y:0,width,height});let y=top;
    for(const line of lines){
      if(y<bottom){if(pdf.getPageCount()>=30)throw new Error('This letter exceeds the 30-page safety limit. Split it into two documents.');page=pdf.addPage([width,height]);page.drawImage(background,{x:0,y:0,width,height});y=top;}
      let drawX=x+(line.align==='center'?(maxWidth-line.width)/2:line.align==='right'?maxWidth-line.width:0);
      for(const run of line.runs){if(run.custom&&run.bold)page.pushOperators(pushGraphicsState(),setTextRenderingMode(TextRenderingMode.FillAndOutline),setLineWidth(fontSize*.02),setStrokingRgbColor(.13,.16,.15));page.drawText(run.text,{x:drawX,y,size:fontSize,font:run.font,color:rgb(.13,.16,.15),xSkew:degrees(run.custom&&run.italic?12:0)});if(run.custom&&run.bold)page.pushOperators(popGraphicsState());if(run.underline)page.drawLine({start:{x:drawX,y:y-1.5},end:{x:drawX+run.width,y:y-1.5},thickness:.6,color:rgb(.13,.16,.15)});drawX+=run.width;}
      y-=leading;
    }
    pdf.setTitle(title||'Official letter');pdf.setCreator('Letter Studio');pdf.setProducer('Letter Studio');
    const bytes=await pdf.save({useObjectStreams:true});
    if(bytes.byteLength<1000000) return {blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),pageCount:pdf.getPageCount(),bytes:bytes.byteLength};
  }
  throw new Error('This document cannot fit below 1 MB at the supported quality. Try a simpler letterhead or a shorter letter.');
}
export async function renderPdfPage(blob:Blob,pageNumber=1) {
  const lib=await pdfjs();const pdf=await lib.getDocument({data:await blob.arrayBuffer()}).promise;
  try {const page=await pdf.getPage(pageNumber);const viewport=page.getViewport({scale:1.5});const {canvas}=canvasFor(viewport.width,viewport.height);await page.render({canvas,viewport}).promise;return {dataUrl:canvas.toDataURL('image/png'),pageCount:pdf.numPages};}
  finally{await pdf.destroy();}
}


export async function renderPdfThumbnails(blob:Blob){const lib=await pdfjs();const pdf=await lib.getDocument({data:await blob.arrayBuffer()}).promise;try{const images:string[]=[];for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number);const viewport=page.getViewport({scale:.22});const {canvas}=canvasFor(viewport.width,viewport.height);await page.render({canvas,viewport}).promise;images.push(canvas.toDataURL('image/jpeg',.7));}return images;}finally{await pdf.destroy();}}
