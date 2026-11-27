import {PDFDocument,PDFFont,StandardFonts} from 'pdf-lib';
export type TextRun={text:string;bold:boolean;italic:boolean;underline:boolean};
/** scale enlarges headings (h1–h3) relative to the body size. */
export type TextBlock={kind?:'text';runs:TextRun[];align:'left'|'center'|'right'|'justify';scale?:number};
export type TableCell={blocks:TextBlock[];colspan:number;rowspan:number;header:boolean};
export type TableBlock={kind:'table';rows:TableCell[][];headerRows:number};
export type RichBlock=TextBlock|TableBlock;
export type LaidRun=TextRun&{font:PDFFont;width:number;custom?:boolean};
export type LaidLine={kind:'line';runs:LaidRun[];width:number;align:TextBlock['align'];last:boolean;size:number};
export type LaidCell={x:number;width:number;lines:LaidLine[];header:boolean};
/** One table row. repeat holds the table's header rows, redrawn when the row starts a new page. */
export type LaidRow={kind:'row';cells:LaidCell[];height:number;width:number;header:boolean;lastRow:boolean;repeat:LaidRow[]};
export type LaidItem=LaidLine|LaidRow;
/** Cell padding as a fraction of the font size. */
export const TABLE_PADDING=.45;
const HEADING_SCALE:Record<string,number>={H1:1.6,H2:1.35,H3:1.15};
const BLOCKED=['SCRIPT','STYLE','IFRAME','OBJECT','SVG','TEMPLATE'];
const ALLOWED=['DIV','P','BR','B','STRONG','I','EM','U','UL','OL','LI','BLOCKQUOTE','SPAN','H1','H2','H3','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH'];
const RENAMED:Record<string,string>={H4:'h3',H5:'h3',H6:'h3'};
const span=(value:number)=>Math.min(20,Math.max(1,Math.floor(value)||1));

export function textHtml(text:string){return text.split('\n').map(line=>`<div>${line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')||'<br>'}</div>`).join('');}
/** Keep only the formatting the PDF can reproduce: text styles, alignment, lists, headings, and tables. */
export function sanitizeRichHtml(html:string){
 const source=document.createElement('div');source.innerHTML=html;const out=document.createElement('div');
 const copy=(node:Node,parent:HTMLElement)=>{
  if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent||''));return;}
  if(!(node instanceof HTMLElement)||BLOCKED.includes(node.tagName))return;
  let tag=node.tagName;
  // Google Docs wraps pasted content in <b style="font-weight:normal">.
  if((tag==='B'||tag==='STRONG')&&/^(normal|[1-4]00)$/.test(node.style.fontWeight))tag='SPAN';
  const name=RENAMED[tag]||(ALLOWED.includes(tag)?tag.toLowerCase():'');
  if(!name){node.childNodes.forEach(n=>copy(n,parent));return;}
  const el=document.createElement(name);
  for(const prop of ['textAlign','fontWeight','fontStyle','textDecoration'] as const)if(node.style[prop])el.style[prop]=node.style[prop];
  if(node instanceof HTMLTableCellElement){if(span(node.colSpan)>1)el.setAttribute('colspan',String(span(node.colSpan)));if(span(node.rowSpan)>1)el.setAttribute('rowspan',String(span(node.rowSpan)));}
  node.childNodes.forEach(n=>copy(n,el));parent.appendChild(el);
 };
 source.childNodes.forEach(n=>copy(n,out));return out.innerHTML;
}
type Style=Omit<TextRun,'text'>;
export function readRichText(html:string):RichBlock[]{const root=document.createElement('div');root.innerHTML=html;return readNodes(Array.from(root.childNodes),{bold:false,italic:false,underline:false});}
function readNodes(nodes:ChildNode[],base:Style):RichBlock[]{
 const blocks:RichBlock[]=[];let block:TextBlock={runs:[],align:'left'};
 const flush=(force=false)=>{if(block.runs.length||force)blocks.push(block);block={runs:[],align:block.align};};
 const visit=(node:Node,style:Style)=>{if(node.nodeType===3){const text=node.textContent||'';if(text)block.runs.push({text,...style});return;}if(!(node instanceof HTMLElement)||BLOCKED.includes(node.tagName))return;
  const tag=node.tagName;
  if(tag==='TABLE'){flush();const table=readTable(node as HTMLTableElement,style);if(table.rows.length)blocks.push(table);return;}
  const isBlock=['DIV','P','LI','H1','H2','H3','BLOCKQUOTE'].includes(tag);if(isBlock){flush();block.align=(['center','right','justify'].includes(node.style.textAlign)?node.style.textAlign:'left') as TextBlock['align'];if(HEADING_SCALE[tag])block.scale=HEADING_SCALE[tag];}
  if(tag==='BR'){flush(true);return;}
  const next={bold:style.bold||['B','STRONG','H1','H2','H3','TH'].includes(tag)||['bold','700'].includes(node.style.fontWeight),italic:style.italic||['I','EM'].includes(tag)||node.style.fontStyle==='italic',underline:style.underline||tag==='U'||node.style.textDecoration.includes('underline')};
  if(tag==='LI')block.runs.push({text:node.parentElement?.tagName==='OL'?`${Array.from(node.parentElement.children).indexOf(node)+1}. `:'• ',...next});
  const count=blocks.length;node.childNodes.forEach(child=>visit(child,next));if(isBlock)flush(blocks.length===count&&!block.runs.length);
 };nodes.forEach(node=>visit(node,base));flush();return blocks;
}
function readTable(table:HTMLTableElement,style:Style):TableBlock{
 const rows:TableCell[][]=[];let headerRows=0,leading=true;
 for(const tr of Array.from(table.rows)){
  const cells=Array.from(tr.cells).map(cell=>{const header=cell.tagName==='TH';return {blocks:flattenTables(readNodes(Array.from(cell.childNodes),{...style,bold:style.bold||header})),colspan:span(cell.colSpan),rowspan:span(cell.rowSpan),header};});
  if(!cells.length)continue;
  const isHeader=tr.parentElement?.tagName==='THEAD'||cells.every(c=>c.header);
  if(leading&&isHeader)headerRows++;else leading=false;
  rows.push(cells);
 }
 // A table made only of header rows has nothing to repeat.
 return {kind:'table',rows,headerRows:headerRows===rows.length?0:headerRows};
}
/** Tables inside table cells are written out as text rows. */
function flattenTables(blocks:RichBlock[]):TextBlock[]{return blocks.flatMap(b=>b.kind==='table'?b.rows.map(row=>({runs:row.flatMap((cell,i)=>[...(i?[{text:' | ',bold:false,italic:false,underline:false}]:[]),...cell.blocks.flatMap(x=>x.runs)]),align:'left' as const})):[b]);}
/**
 * Share the table width between columns like a browser's automatic table layout:
 * columns whose content fits their fair share keep their natural width, the rest share
 * what is left (never below their longest word), and any spare space is spread evenly.
 */
export function columnWidths(natural:number[],minimum:number[],width:number){
 const sum=(list:number[])=>list.reduce((a,b)=>a+b,0);
 if(sum(natural)<=width)return natural.map(n=>n*width/sum(natural));
 if(sum(minimum)>=width)return minimum.map(m=>m*width/sum(minimum));
 const widths=[...natural];let open=natural.map((_,i)=>i),remaining=width;
 for(;;){const share=remaining/open.length;const fits=open.filter(i=>natural[i]<=share);if(!fits.length||fits.length===open.length)break;for(const i of fits)remaining-=natural[i];open=open.filter(i=>!fits.includes(i));}
 const wanted=sum(open.map(i=>natural[i]));for(const i of open)widths[i]=Math.max(minimum[i],remaining*natural[i]/wanted);
 // Honouring minimums can overshoot; take the excess back from columns above their minimum.
 let excess=sum(widths)-width;
 if(excess>.01){const flexible=open.filter(i=>widths[i]>minimum[i]);const room=sum(flexible.map(i=>widths[i]-minimum[i]));for(const i of flexible)widths[i]-=excess*(widths[i]-minimum[i])/room;excess=sum(widths)-width;}
 return excess>.01?widths.map(w=>w*width/sum(widths)):widths;
}
/** Plain text of rich HTML: one line per paragraph, table cells separated by tabs. */
export function richPlainText(html:string){
 const text=(b:TextBlock)=>b.runs.map(r=>r.text).join('');
 return readRichText(html).flatMap(b=>b.kind==='table'?b.rows.map(row=>row.map(cell=>cell.blocks.map(text).join(' ')).join('\t')):[text(b)]).join('\n');
}
export async function richLines(pdf:PDFDocument,fallback:PDFFont,{html,text,family,size,width,customFont,lineHeight=1.5}:{html?:string;text:string;family:string;size:number;width:number;customFont?:PDFFont;lineHeight?:number}):Promise<LaidItem[]>{
 const embedded=new Map<string,PDFFont>();const variants=family==='Times New Roman'?[StandardFonts.TimesRoman,StandardFonts.TimesRomanBold,StandardFonts.TimesRomanItalic,StandardFonts.TimesRomanBoldItalic]:family==='Courier New'?[StandardFonts.Courier,StandardFonts.CourierBold,StandardFonts.CourierOblique,StandardFonts.CourierBoldOblique]:[StandardFonts.Helvetica,StandardFonts.HelveticaBold,StandardFonts.HelveticaOblique,StandardFonts.HelveticaBoldOblique];
 const supported=customFont?new Set(customFont.getCharacterSet()):null;
 async function layout(blocks:TextBlock[],maxWidth:number):Promise<LaidLine[]>{
  const lines:LaidLine[]=[];
  for(const block of blocks){const s=size*(block.scale||1);let line:LaidLine={kind:'line',runs:[],width:0,align:block.align,last:false,size:s};const push=()=>{lines.push(line);line={kind:'line',runs:[],width:0,align:block.align,last:false,size:s};};
   for(const run of block.runs){const fontName=variants[(run.bold?1:0)+(run.italic?2:0)];if(!customFont&&!embedded.has(fontName))embedded.set(fontName,await pdf.embedFont(fontName));const primary=customFont||embedded.get(fontName)!;
    for(const token of run.text.replace(/\r/g,'').replace(/\t/g,'    ').split(/(\s+)/)){if(!token)continue;if(token.includes('\n')){for(let i=0;i<(token.match(/\n/g)||[]).length;i++)push();continue;}
     const pieces:LaidRun[]=[];for(const ch of token){let font=primary;try{if(supported&&!supported.has(ch.codePointAt(0)!))throw 0;primary.encodeText(ch);}catch{font=fallback;try{if(!font.getCharacterSet().includes(ch.codePointAt(0)!))throw 0;}catch{throw new Error(`The character “${ch}” is not supported. Please replace it before exporting.`);}}const w=font.widthOfTextAtSize(ch,s);const prev=pieces.at(-1);if(prev&&prev.font===font){prev.text+=ch;prev.width+=w;}else pieces.push({...run,text:ch,font,width:w,custom:font===customFont});}
     const tokenWidth=pieces.reduce((sum,p)=>sum+p.width,0);if(line.width+tokenWidth>maxWidth&&line.runs.length)push();if(/^\s+$/.test(token)&&!line.runs.length)continue;
     for(const piece of pieces){if(piece.width<=maxWidth){if(line.width+piece.width>maxWidth&&line.runs.length)push();line.runs.push(piece);line.width+=piece.width;}else for(const ch of piece.text){const w=piece.font.widthOfTextAtSize(ch,s);if(line.width+w>maxWidth&&line.runs.length)push();line.runs.push({...piece,text:ch,width:w});line.width+=w;}}
    }
   }line.last=true;lines.push(line);
  }return lines;
 }
 // Height from the top of a cell's text to just below the last line's descenders.
 const textHeight=(lines:LaidLine[])=>lines.length?lines.slice(0,-1).reduce((sum,l)=>sum+l.size*lineHeight,0)+lines.at(-1)!.size*1.22:0;
 async function layoutTable(table:TableBlock):Promise<LaidRow[]>{
  const pad=size*TABLE_PADDING;
  // Place cells on a grid, honouring column and row spans.
  const placed:{cell:TableCell;row:number;col:number}[]=[];const taken:boolean[][]=[];let cols=0;
  table.rows.forEach((cells,r)=>{taken[r]??=[];let c=0;for(const cell of cells){while(taken[r][c])c++;for(let dr=0;dr<cell.rowspan&&r+dr<table.rows.length;dr++)for(let dc=0;dc<cell.colspan;dc++)(taken[r+dr]??=[])[c+dc]=true;placed.push({cell,row:r,col:c});c+=cell.colspan;}cols=Math.max(cols,c);});
  // Size columns from their content: as natural as possible, never narrower than the longest word.
  const natural=Array<number>(cols).fill(0),minimum=Array<number>(cols).fill(0);
  for(const p of placed)if(p.cell.colspan===1){
   const lines=await layout(p.cell.blocks,1e6);
   natural[p.col]=Math.max(natural[p.col],...lines.map(l=>l.width+2*pad));
   minimum[p.col]=Math.max(minimum[p.col],...lines.flatMap(l=>l.runs.filter(r=>r.text.trim()).map(r=>Math.min(r.width,width/cols)+2*pad)));
  }
  for(let i=0;i<cols;i++){natural[i]=Math.max(natural[i],size*3+2*pad);minimum[i]=Math.min(Math.max(minimum[i],size+2*pad),natural[i]);}
  const total=(list:number[])=>list.reduce((a,b)=>a+b,0);
  const widths=columnWidths(natural,minimum,width);
  const xs=widths.map((_,i)=>total(widths.slice(0,i)));
  const rows:LaidRow[]=[];
  for(let r=0;r<table.rows.length;r++){
   const cells:LaidCell[]=[];const covered=new Set<number>();
   for(const p of placed.filter(p=>p.row===r)){const w=total(widths.slice(p.col,p.col+p.cell.colspan));for(let c=p.col;c<p.col+p.cell.colspan;c++)covered.add(c);cells.push({x:xs[p.col],width:w,lines:await layout(p.cell.blocks,Math.max(size,w-2*pad)),header:p.cell.header});}
   // Slots taken by a merged cell from above, or missing in short rows, still get their grid lines.
   for(let c=0;c<cols;c++)if(!covered.has(c))cells.push({x:xs[c],width:widths[c],lines:[],header:false});
   rows.push({kind:'row',cells,height:Math.max(size*1.22,...cells.map(c=>textHeight(c.lines)))+2*pad,width,header:r<table.headerRows,lastRow:r===table.rows.length-1,repeat:[]});
  }
  const header=rows.slice(0,table.headerRows);for(const row of rows.slice(table.headerRows))row.repeat=header;
  return rows;
 }
 const blocks:RichBlock[]=html?readRichText(html):text.split('\n').map(t=>({runs:[{text:t,bold:false,italic:false,underline:false}],align:'left' as const}));
 const items:LaidItem[]=[];
 for(const block of blocks)items.push(...(block.kind==='table'?await layoutTable(block):await layout([block],width)));
 return items;
}
