'use client';
import {useEffect,useRef,useState,type KeyboardEvent,type ClipboardEvent} from 'react';
import {Bold,Italic,Underline,AlignLeft,AlignCenter,AlignRight,List,ListOrdered,Undo2,Redo2,Type,Plus,Table2,BetweenHorizontalStart,BetweenHorizontalEnd,BetweenVerticalStart,BetweenVerticalEnd,Trash2,X,Check} from 'lucide-react';
import {CustomFont,fontAlias} from '@/lib/custom-fonts';
import {textHtml,sanitizeRichHtml} from '@/lib/rich-text';
import './font-ui.css';

const emptyCell='<br>';
const cellTag=(row:HTMLTableRowElement)=>row.parentElement?.tagName==='THEAD'||(row.cells.length>0&&Array.from(row.cells).every(c=>c.tagName==='TH'))?'th':'td';

export default function DocumentEditor({text,html,onChange,fontSize,fontFamily,onSize,onFamily,fonts,onFonts}:{text:string;html:string;onChange:(text:string,html:string)=>void;fontSize:number;fontFamily:string;onSize:(n:number)=>void;onFamily:(s:string)=>void;fonts:CustomFont[];onFonts:()=>void}){
 const editor=useRef<HTMLDivElement>(null);const latest=useRef({text:'',html:''});
 const saved=useRef<Range|null>(null);
 const [cell,setCell]=useState<HTMLTableCellElement|null>(null);
 const [picker,setPicker]=useState(false),[rows,setRows]=useState(3),[cols,setCols]=useState(3),[headerRow,setHeaderRow]=useState(true);
 // Only replace the DOM for an external change (such as a Word import).
 // Rewriting content during its own input event can re-enter browser editing.
 useEffect(()=>{if(text===latest.current.text&&html===latest.current.html)return;const value=html?sanitizeRichHtml(html):text?textHtml(text):'';latest.current={text,html};if(editor.current)editor.current.innerHTML=value;},[html,text]);
 // Show table tools while the cursor is inside a table cell.
 useEffect(()=>{
  const track=()=>{const node=document.getSelection()?.anchorNode;const el=node instanceof Element?node:node?.parentElement;const found=el?.closest('td,th') as HTMLTableCellElement|null;setCell(found&&editor.current?.contains(found)?found:null);};
  document.addEventListener('selectionchange',track);return()=>document.removeEventListener('selectionchange',track);
 },[]);
 const update=()=>{const el=editor.current!;const next={text:el.innerText,html:el.innerHTML};if(next.text===latest.current.text&&next.html===latest.current.html)return;latest.current=next;onChange(next.text,next.html);};
 const command=(name:string)=>{editor.current?.focus();document.execCommand(name,false);update();};
 function focusCell(target?:HTMLTableCellElement|null){
  if(!target||!editor.current)return;editor.current.focus();
  const range=document.createRange();range.selectNodeContents(target);range.collapse(true);
  const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);setCell(target);
 }
 function newRow(template:HTMLTableRowElement,tag:'td'|'th'){const row=document.createElement('tr');const count=Array.from(template.cells).reduce((n,c)=>n+Math.max(1,c.colSpan),0);for(let i=0;i<count;i++){const c=document.createElement(tag);c.innerHTML=emptyCell;row.appendChild(c);}return row;}
 function addRow(after:boolean){
  if(!cell)return;const row=cell.parentElement as HTMLTableRowElement;const table=row.closest('table')!;
  const inHead=row.parentElement?.tagName==='THEAD';
  if(inHead&&after){let body=table.tBodies[0];if(!body){body=document.createElement('tbody');table.appendChild(body);}const added=newRow(row,'td');body.insertBefore(added,body.firstChild);focusCell(added.cells[0]);}
  else{const added=newRow(row,inHead?'th':cellTag(row)==='th'&&!after?'th':'td');row.parentElement!.insertBefore(added,after?row.nextSibling:row);focusCell(added.cells[Math.min(cell.cellIndex,added.cells.length-1)]);}
  update();
 }
 function addColumn(after:boolean){
  if(!cell)return;const table=cell.closest('table')!;const index=cell.cellIndex+(after?1:0);let target:HTMLTableCellElement|null=null;
  for(const row of Array.from(table.rows)){const c=document.createElement(cellTag(row));c.innerHTML=emptyCell;row.insertBefore(c,row.cells[index]??null);if(row===cell.parentElement)target=c;}
  focusCell(target);update();
 }
 function removeTableIfEmpty(table:HTMLTableElement){if(!table.rows.length||!table.querySelector('td,th')){table.remove();setCell(null);return true;}return false;}
 function deleteRow(){
  if(!cell)return;const row=cell.parentElement as HTMLTableRowElement;const table=row.closest('table')!;const index=cell.cellIndex;
  const next=(row.nextElementSibling||row.previousElementSibling) as HTMLTableRowElement|null;row.remove();
  if(!removeTableIfEmpty(table))focusCell(next?.cells[Math.min(index,next.cells.length-1)]??table.querySelector('td,th') as HTMLTableCellElement);
  update();
 }
 function deleteColumn(){
  if(!cell)return;const table=cell.closest('table')!;const index=cell.cellIndex;const row=cell.parentElement as HTMLTableRowElement;
  for(const r of Array.from(table.rows)){r.cells[index]?.remove();if(!r.cells.length)r.remove();}
  if(!removeTableIfEmpty(table))focusCell(row.isConnected?row.cells[Math.max(0,index-1)]:table.querySelector('td,th') as HTMLTableCellElement);
  update();
 }
 function deleteTable(){if(!cell)return;cell.closest('table')!.remove();setCell(null);editor.current?.focus();update();}
 function openPicker(){
  const selection=document.getSelection();
  saved.current=selection?.rangeCount&&editor.current?.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;
  setPicker(true);
 }
 function insertTable(){
  const el=editor.current;if(!el)return;el.focus();
  const range=saved.current??(()=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);return r;})();
  // Never nest a table inside another table: insert after it instead.
  const host=(range.startContainer instanceof Element?range.startContainer:range.startContainer.parentElement)?.closest('table');
  if(host&&el.contains(host)){range.setStartAfter(host);range.collapse(true);}
  const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);
  const r=Math.min(50,Math.max(1,rows)),c=Math.min(10,Math.max(1,cols));
  const line=(tag:string)=>'<tr>'+Array.from({length:c},()=>`<${tag}>${emptyCell}</${tag}>`).join('')+'</tr>';
  const body=Array.from({length:headerRow?Math.max(1,r-1):r},()=>line('td')).join('');
  document.execCommand('insertHTML',false,`<table data-new="1">${headerRow?'<thead>'+line('th')+'</thead>':''}<tbody>${body}</tbody></table><div><br></div>`);
  const added=el.querySelector('table[data-new]') as HTMLTableElement|null;added?.removeAttribute('data-new');
  setPicker(false);focusCell(added?.querySelector('td,th') as HTMLTableCellElement);update();
 }
 function keyDown(event:KeyboardEvent<HTMLDivElement>){
  if(event.key!=='Tab'||!cell)return;
  event.preventDefault();const table=cell.closest('table')!;
  const cells=Array.from(table.querySelectorAll('td,th')).filter(c=>c.closest('table')===table) as HTMLTableCellElement[];
  const index=cells.indexOf(cell)+(event.shiftKey?-1:1);
  if(index>=0&&index<cells.length)focusCell(cells[index]);
  else if(!event.shiftKey){const row=cell.parentElement as HTMLTableRowElement;const added=newRow(row,'td');(row.parentElement?.tagName==='THEAD'?(table.tBodies[0]??table):row.parentElement!).appendChild(added);focusCell(added.cells[0]);update();}
 }
 function paste(event:ClipboardEvent<HTMLDivElement>){
  event.preventDefault();
  const rich=event.clipboardData.getData('text/html');
  // Tables pasted from Word, Excel, or Google Docs keep their rows and columns; other pastes stay plain text.
  if(/<table[\s>]/i.test(rich)&&!cell)document.execCommand('insertHTML',false,sanitizeRichHtml(rich));
  else document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));
  update();
 }
 const controls=[{name:'bold',label:'Bold',Icon:Bold},{name:'italic',label:'Italic',Icon:Italic},{name:'underline',label:'Underline',Icon:Underline},{name:'justifyLeft',label:'Align left',Icon:AlignLeft},{name:'justifyCenter',label:'Align center',Icon:AlignCenter},{name:'justifyRight',label:'Align right',Icon:AlignRight},{name:'insertUnorderedList',label:'Bulleted list',Icon:List},{name:'insertOrderedList',label:'Numbered list',Icon:ListOrdered},{name:'undo',label:'Undo',Icon:Undo2},{name:'redo',label:'Redo',Icon:Redo2}];
 const tableTools=[{label:'Add row above',Icon:BetweenHorizontalStart,run:()=>addRow(false)},{label:'Add row below',Icon:BetweenHorizontalEnd,run:()=>addRow(true)},{label:'Add column left',Icon:BetweenVerticalStart,run:()=>addColumn(false)},{label:'Add column right',Icon:BetweenVerticalEnd,run:()=>addColumn(true)}];
 return <div className="document-editor"><div className="document-toolbar" role="toolbar" aria-label="Document formatting"><select aria-label="Typeface" value={fontFamily} onChange={e=>onFamily(e.target.value)}><option value="Arial">Arial / Helvetica</option><option value="Times New Roman">Times New Roman</option><option value="Courier New">Courier New</option>{fonts.map(font=><option key={font.id} value={fontAlias(font.id)}>{font.name}</option>)}</select><button type="button" className="add-font-button font-manager-trigger" title="Upload or import your own typeface" aria-label="Add fonts" aria-haspopup="dialog" onClick={onFonts}><Type size={15}/><span>Add fonts</span><Plus size={12} className="font-trigger-plus"/></button><select aria-label="Font size" value={fontSize} onChange={e=>onSize(+e.target.value)}>{[9,10,11,12,13,14,16,18].map(n=><option key={n} value={n}>{n}</option>)}</select><span className="tool-separator"/>{controls.map(({name,label,Icon})=><button key={name} type="button" title={label} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>command(name)}><Icon size={15}/></button>)}<span className="tool-separator"/><button type="button" title="Insert table" aria-label="Insert table" aria-haspopup="dialog" aria-expanded={picker} className={picker?'active':''} onMouseDown={e=>e.preventDefault()} onClick={()=>picker?setPicker(false):openPicker()}><Table2 size={15}/></button></div>
  {picker&&<div className="table-picker" role="dialog" aria-label="Insert table" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setPicker(false);}if(e.key==='Enter'){e.preventDefault();insertTable();}}}>
   <label>Rows<input type="number" min={1} max={50} value={rows} onChange={e=>setRows(+e.target.value)}/></label>
   <label>Columns<input type="number" min={1} max={10} value={cols} onChange={e=>setCols(+e.target.value)}/></label>
   <label className="table-header-option"><input type="checkbox" checked={headerRow} onChange={e=>setHeaderRow(e.target.checked)}/>Header row</label>
   <span className="table-picker-actions"><button type="button" className="button secondary" onClick={()=>setPicker(false)}><X size={13}/> Cancel</button><button type="button" className="button primary" onClick={insertTable}><Check size={13}/> Insert</button></span>
  </div>}
  {cell&&!picker&&<div className="table-tools" role="toolbar" aria-label="Table">
   <span>Table</span>
   {tableTools.map(({label,Icon,run})=><button key={label} type="button" title={label} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={run}><Icon size={15}/></button>)}
   <span className="tool-separator"/>
   <button type="button" title="Delete row" aria-label="Delete row" onMouseDown={e=>e.preventDefault()} onClick={deleteRow}>− Row</button>
   <button type="button" title="Delete column" aria-label="Delete column" onMouseDown={e=>e.preventDefault()} onClick={deleteColumn}>− Column</button>
   <button type="button" title="Delete table" aria-label="Delete table" className="danger" onMouseDown={e=>e.preventDefault()} onClick={deleteTable}><Trash2 size={14}/></button>
  </div>}
  <div className="document-ruler" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div><div id="letter-content" ref={editor} role="textbox" aria-label="LETTER CONTENT" aria-multiline="true" contentEditable suppressContentEditableWarning className="rich-editor" style={{fontFamily,fontSize:`${fontSize}pt`}} onInput={update} onKeyDown={keyDown} onPaste={paste} onBlur={()=>{if((editor.current?.innerText.length||0)>100000)onChange(text,html);}}/><div className="document-editor-caption">Keep writing. New pages are added automatically in the live preview. Press Tab to move between table cells.</div></div>;
}
