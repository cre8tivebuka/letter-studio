import {PDFDocument,PDFFont,StandardFonts} from 'pdf-lib';
export type TextRun={text:string;bold:boolean;italic:boolean;underline:boolean};
export type TextBlock={runs:TextRun[];align:'left'|'center'|'right'|'justify'};
export type LaidRun=TextRun&{font:PDFFont;width:number;custom?:boolean};
export type LaidLine={runs:LaidRun[];width:number;align:TextBlock['align'];last:boolean};
export function textHtml(text:string){return text.split('\n').map(line=>`<div>${line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')||'<br>'}</div>`).join('');}
export function sanitizeRichHtml(html:string){const source=document.createElement('div');source.innerHTML=html;const out=document.createElement('div');const copy=(node:Node,parent:HTMLElement)=>{if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent||''));return;}if(!(node instanceof HTMLElement)||['SCRIPT','STYLE','IFRAME','OBJECT','SVG'].includes(node.tagName))return;const allowed=['DIV','P','BR','B','STRONG','I','EM','U','UL','OL','LI','BLOCKQUOTE','SPAN','H1','H2','H3'];if(!allowed.includes(node.tagName)){node.childNodes.forEach(n=>copy(n,parent));return;}const el=document.createElement(node.tagName.toLowerCase());for(const prop of ['textAlign','fontWeight','fontStyle','textDecoration'] as const)if(node.style[prop])el.style[prop]=node.style[prop];node.childNodes.forEach(n=>copy(n,el));parent.appendChild(el);};source.childNodes.forEach(n=>copy(n,out));return out.innerHTML;}
export function readRichText(html:string):TextBlock[]{
 const root=document.createElement('div');root.innerHTML=html;const blocks:TextBlock[]=[];let block:TextBlock={runs:[],align:'left'};
 const flush=(force=false)=>{if(block.runs.length||force)blocks.push(block);block={runs:[],align:block.align};};
 const visit=(node:Node,style:Omit<TextRun,'text'>)=>{if(node.nodeType===3){const text=node.textContent||'';if(text)block.runs.push({text,...style});return;}if(!(node instanceof HTMLElement)||['SCRIPT','STYLE','IFRAME','OBJECT','SVG'].includes(node.tagName))return;
  const tag=node.tagName,isBlock=['DIV','P','LI','H1','H2','H3','BLOCKQUOTE'].includes(tag);if(isBlock){flush();block.align=(['center','right','justify'].includes(node.style.textAlign)?node.style.textAlign:'left') as TextBlock['align'];}
  if(tag==='BR'){flush(true);return;}
  const next={bold:style.bold||['B','STRONG','H1','H2','H3'].includes(tag)||['bold','700'].includes(node.style.fontWeight),italic:style.italic||['I','EM'].includes(tag)||node.style.fontStyle==='italic',underline:style.underline||tag==='U'||node.style.textDecoration.includes('underline')};
  if(tag==='LI')block.runs.push({text:node.parentElement?.tagName==='OL'?`${Array.from(node.parentElement.children).indexOf(node)+1}. `:'• ',...next});
  const count=blocks.length;node.childNodes.forEach(child=>visit(child,next));if(isBlock)flush(blocks.length===count&&!block.runs.length);
 };root.childNodes.forEach(node=>visit(node,{bold:false,italic:false,underline:false}));flush();return blocks;
}
export async function richLines(pdf:PDFDocument,fallback:PDFFont,{html,text,family,size,width,customFont}:{html?:string;text:string;family:string;size:number;width:number;customFont?:PDFFont}):Promise<LaidLine[]>{
 const embedded=new Map<string,PDFFont>();const variants=family==='Times New Roman'?[StandardFonts.TimesRoman,StandardFonts.TimesRomanBold,StandardFonts.TimesRomanItalic,StandardFonts.TimesRomanBoldItalic]:family==='Courier New'?[StandardFonts.Courier,StandardFonts.CourierBold,StandardFonts.CourierOblique,StandardFonts.CourierBoldOblique]:[StandardFonts.Helvetica,StandardFonts.HelveticaBold,StandardFonts.HelveticaOblique,StandardFonts.HelveticaBoldOblique];
 const blocks=html?readRichText(html):text.split('\n').map(t=>({runs:[{text:t,bold:false,italic:false,underline:false}],align:'left' as const}));const lines:LaidLine[]=[];
 for(const block of blocks){let line:LaidLine={runs:[],width:0,align:block.align,last:false};const push=()=>{lines.push(line);line={runs:[],width:0,align:block.align,last:false};};
  for(const run of block.runs){const fontName=variants[(run.bold?1:0)+(run.italic?2:0)];if(!customFont&&!embedded.has(fontName))embedded.set(fontName,await pdf.embedFont(fontName));const primary=customFont||embedded.get(fontName)!;const supported=customFont?new Set(customFont.getCharacterSet()):null;
   for(const token of run.text.replace(/\r/g,'').replace(/\t/g,'    ').split(/(\s+)/)){if(!token)continue;if(token.includes('\n')){for(let i=0;i<(token.match(/\n/g)||[]).length;i++)push();continue;}
    const pieces:LaidRun[]=[];for(const ch of token){let font=primary;try{if(supported&&!supported.has(ch.codePointAt(0)!))throw 0;primary.encodeText(ch);}catch{font=fallback;try{if(!font.getCharacterSet().includes(ch.codePointAt(0)!))throw 0;}catch{throw new Error(`The character “${ch}” is not supported. Please replace it before exporting.`);}}const w=font.widthOfTextAtSize(ch,size);const prev=pieces.at(-1);if(prev&&prev.font===font){prev.text+=ch;prev.width+=w;}else pieces.push({...run,text:ch,font,width:w,custom:font===customFont});}
    const tokenWidth=pieces.reduce((sum,p)=>sum+p.width,0);if(line.width+tokenWidth>width&&line.runs.length)push();if(/^\s+$/.test(token)&&!line.runs.length)continue;
    for(const piece of pieces){if(piece.width<=width){if(line.width+piece.width>width&&line.runs.length)push();line.runs.push(piece);line.width+=piece.width;}else for(const ch of piece.text){const w=piece.font.widthOfTextAtSize(ch,size);if(line.width+w>width)push();line.runs.push({...piece,text:ch,width:w});line.width+=w;}}
   }
  }line.last=true;lines.push(line);
 }return lines;
}
