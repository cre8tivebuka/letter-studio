import {fontAlias,type CustomFont} from './custom-fonts';
import {richPlainText,sanitizeRichHtml} from './rich-text';

export const FONT_SIZES=[9,10,11,12,13,14,16,18];
const MAX_FILE=20*1024*1024;
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const BUILT_IN:Record<string,string>={'arial':'Arial','helvetica':'Arial','times new roman':'Times New Roman','times':'Times New Roman','courier new':'Courier New','courier':'Courier New'};
export const familyLabel=(family:string)=>family==='Arial'?'Arial / Helvetica':family;
const squash=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]/g,'');

/** The closest typeface the app can embed for a Word font name. */
export function closestFamily(name:string){
 const known=BUILT_IN[name.trim().toLowerCase()];if(known)return known;
 if(/mono|courier|consolas|menlo|lucida console|source code|code\b/i.test(name))return 'Courier New';
 if(/sans/i.test(name))return 'Arial';
 if(/times|georgia|cambria|garamond|palatino|book ?antiqua|baskerville|bodoni|century|constantia|didot|minion|caslon|bookman|perpetua|serif|charter|sabon|merriweather|playfair|lora/i.test(name))return 'Times New Roman';
 return 'Arial';
}

type Defaults={font:string|null;size:number|null};
/** Word's default font and size come from the Normal style, the document defaults, or the theme. */
async function readDefaults(buffer:ArrayBuffer):Promise<Defaults>{
 const {default:JSZip}=await import('jszip');
 const zip=await JSZip.loadAsync(buffer);
 const stylesXml=await zip.file('word/styles.xml')?.async('string');if(!stylesXml)return {font:null,size:null};
 const themeXml=await zip.file('word/theme/theme1.xml')?.async('string');
 const parse=(xml:string)=>new DOMParser().parseFromString(xml,'application/xml');
 const theme=themeXml?parse(themeXml):null;
 const themeFont=(kind:'major'|'minor')=>theme?.getElementsByTagNameNS(A,kind+'Font')[0]?.getElementsByTagNameNS(A,'latin')[0]?.getAttribute('typeface')||null;
 const styles=parse(stylesXml);
 const child=(el:Element|undefined,name:string)=>el?Array.from(el.children).find(c=>c.localName===name):undefined;
 const fontOf=(rPr?:Element)=>{const f=child(rPr,'rFonts');if(!f)return null;const ascii=f.getAttributeNS(W,'ascii');if(ascii)return ascii;const t=f.getAttributeNS(W,'asciiTheme');return t?themeFont(t.startsWith('major')?'major':'minor'):null;};
 const sizeOf=(rPr?:Element)=>{const v=child(rPr,'sz')?.getAttributeNS(W,'val');return v&&Number(v)>0?Number(v)/2:null;};
 const docDefaults=child(styles.getElementsByTagNameNS(W,'rPrDefault')[0],'rPr');
 const normal=Array.from(styles.getElementsByTagNameNS(W,'style')).find(s=>s.getAttributeNS(W,'type')==='paragraph'&&['1','true'].includes(s.getAttributeNS(W,'default')||''));
 const normalRPr=child(normal,'rPr');
 return {font:fontOf(normalRPr)??fontOf(docDefaults)??null,size:sizeOf(normalRPr)??sizeOf(docDefaults)??null};
}

/** Import a .docx with its tables, text formatting, alignment, and main font. */
export async function importWordDocument(file:File,fonts:CustomFont[]){
 if(!file.size)throw new Error('This file is empty. Please choose another file.');
 if(file.size>MAX_FILE)throw new Error('Please use a file smaller than 20 MB.');
 const buffer=await file.arrayBuffer();
 const module:any=await import('mammoth');const mammoth=module.default??module;
 const defaults=await readDefaults(buffer).catch(():Defaults=>({font:null,size:null}));
 const fontUse=new Map<string,number>(),sizeUse=new Map<number,number>();const aligns:(string|null)[]=[];
 let result:{value:string};
 try{
  result=await mammoth.convertToHtml({arrayBuffer:buffer},{styleMap:['u => u'],ignoreEmptyParagraphs:false,transformDocument:(doc:any)=>{
   for(const p of mammoth.transforms.getDescendantsOfType(doc,'paragraph'))aligns.push(p.alignment||null);
   for(const run of mammoth.transforms.getDescendantsOfType(doc,'run')){
    const length=(run.children||[]).reduce((n:number,c:any)=>n+(c.type==='text'?c.value.length:0),0);if(!length)continue;
    const font=run.font||defaults.font,size=run.fontSize||defaults.size;
    if(font)fontUse.set(font,(fontUse.get(font)||0)+length);if(size)sizeUse.set(size,(sizeUse.get(size)||0)+length);
   }
   return doc;
  }});
 }catch{throw new Error('This Word document could not be opened. Save it again as .docx and retry.');}
 const root=document.createElement('div');root.innerHTML=result.value;
 // One HTML block per Word paragraph, in order, so paragraph alignment can be carried across.
 const paragraphs=Array.from(root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')) as HTMLElement[];
 if(paragraphs.length===aligns.length)paragraphs.forEach((el,i)=>{const a=aligns[i];if(a==='center'||a==='right')el.style.textAlign=a;else if(a==='both'||a==='distribute')el.style.textAlign='justify';});
 // Keep blank paragraphs visible in the editor.
 for(const el of paragraphs)if(!el.textContent?.trim()&&!el.querySelector('br'))el.innerHTML='<br>';
 const html=sanitizeRichHtml(root.innerHTML);const text=richPlainText(html).trim();
 if(!text)throw new Error('No text was found. Please paste or type the letter instead.');
 if(text.length>100000)throw new Error('This letter is too long. Please keep it below 100,000 characters.');
 const most=<T,>(map:Map<T,number>)=>[...map.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
 const wordFont=most(fontUse)??null,wordSize=most(sizeUse)??null;
 let fontFamily:string|undefined,fontNote='';
 if(wordFont){
  const own=fonts.find(f=>squash(f.name).startsWith(squash(wordFont)));
  if(own)fontFamily=fontAlias(own.id);
  else{fontFamily=closestFamily(wordFont);if(!BUILT_IN[wordFont.trim().toLowerCase()])fontNote=` ${wordFont} isn't available here, so the closest match (${familyLabel(fontFamily)}) is used. Add ${wordFont} with Add fonts to match it exactly.`;}
 }
 const fontSize=wordSize?FONT_SIZES.reduce((best,n)=>Math.abs(n-wordSize)<Math.abs(best-wordSize)?n:best):undefined;
 const tables=root.querySelectorAll('table').length;
 const notice='Word document imported'+(tables?` with ${tables} table${tables===1?'':'s'}`:'')+' and its formatting.'+fontNote;
 return {html,text,fontFamily,fontSize,notice};
}
