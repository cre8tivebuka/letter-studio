import {chromium,launchOptions,testUrl} from './browser-runtime.mjs';
import {mkdir} from 'node:fs/promises';
import {PDFDocument,rgb} from 'pdf-lib';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
const output='outputs/tables-qa';await mkdir(output,{recursive:true});
const editor=()=>page.getByRole('textbox',{name:'LETTER CONTENT'});
const tableTool=name=>page.getByRole('toolbar',{name:'Table',exact:true}).getByRole('button',{name,exact:true});
const shape=()=>editor().evaluate(e=>Array.from(e.querySelectorAll('table')).map(t=>Array.from(t.rows).map(r=>Array.from(r.cells).map(c=>c.tagName+':'+c.innerText.trim()))));
async function pdfPages(){
 await page.getByRole('link',{name:'Download PDF',exact:true}).waitFor({timeout:60000});
 const bytes=new Uint8Array(await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.querySelector('a[download]').href)).arrayBuffer()))));
 assert.ok(bytes.length<1000000,'PDF stays below 1 MB');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:bytes.slice(),useSystemFonts:true}).promise;const pages=[];
 for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);const items=(await p.getTextContent()).items.filter(i=>'str' in i&&i.str.trim()).map(i=>({str:i.str,x:i.transform[4],y:i.transform[5],font:i.fontName}));const ops=await p.getOperatorList();pages.push({items,text:items.map(i=>i.str).join(' '),paths:ops.fnArray.filter(f=>f===pdfjs.OPS.constructPath).length});}
 await pdf.destroy();return {pages,bytes,doc:await PDFDocument.load(bytes)};
}
const find=(pg,str)=>pg.items.find(i=>i.str.includes(str));
try{
 await page.goto(testUrl);
 const blank=await PDFDocument.create();blank.addPage([595,842]).drawText('ACME STUDIO',{x:60,y:780,size:22,color:rgb(0,.28,1)});
 await page.locator('#letterhead-file').setInputFiles({name:'letterhead.pdf',mimeType:'application/pdf',buffer:Buffer.from(await blank.save())});
 await page.getByRole('img',{name:'Uploaded empty letterhead'}).waitFor({timeout:60000});

 // 1. Insert a table from the toolbar and fill it with Tab.
 await editor().fill('Intro line before the table.');
 await page.getByRole('button',{name:'Insert table',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Insert table'});
 await picker.getByLabel('Rows').fill('3');await picker.getByLabel('Columns').fill('2');
 await picker.getByRole('button',{name:'Insert'}).click();
 assert.deepEqual(await shape(),[[['TH:','TH:'],['TD:','TD:'],['TD:','TD:']]],'3×2 table with a header row');
 await page.getByRole('toolbar',{name:'Table',exact:true}).waitFor();
 for(const [i,word] of ['Name','Amount','Paper','12','Ink','4'].entries()){await page.keyboard.type(word);if(i<5)await page.keyboard.press('Tab');}
 await page.keyboard.press('Tab');await page.keyboard.type('Pens');await page.keyboard.press('Tab');await page.keyboard.type('9');
 assert.deepEqual(await shape(),[[['TH:Name','TH:Amount'],['TD:Paper','TD:12'],['TD:Ink','TD:4'],['TD:Pens','TD:9']]],'Typing with Tab, and Tab at the end adds a row');
 await tableTool('Add column right').click();
 assert.equal((await shape())[0].every(r=>r.length===3),true,'Column added to every row');
 await tableTool('Delete column').click();
 assert.equal((await shape())[0].every(r=>r.length===2),true,'Column deleted');
 await tableTool('Add row above').click();assert.equal((await shape())[0].length,5);
 await tableTool('Delete row').click();assert.equal((await shape())[0].length,4);
 await page.locator('.document-editor').screenshot({path:output+'/editor-table.png'});
 let pdf=await pdfPages();let first=pdf.pages[0];
 for(const word of ['Name','Amount','Paper','12','Pens','9'])assert.ok(find(first,word),word+' is in the PDF');
 assert.ok(Math.abs(find(first,'Paper').y-find(first,'12').y)<.5,'Cells of a row share a line');
 assert.ok(find(first,'12').x>find(first,'Paper').x+50,'Second column sits to the right');
 assert.ok(find(first,'Paper').y<find(first,'Name').y,'Rows go down the page');
 assert.ok(first.paths>=8,'Table borders are drawn');
 assert.ok(/Bold/.test(find(first,'Name').font)||pdf.doc.context.enumerateIndirectObjects().some(([,o])=>o.toString().includes('Helvetica-Bold')),'Header row is bold');

 // 2. Paste a table copied from a spreadsheet; ordinary pastes stay plain text.
 await editor().evaluate(e=>{e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);});
 const pasteData=(data)=>editor().evaluate((e,data)=>{const dt=new DataTransfer();for(const [k,v] of Object.entries(data))dt.setData(k,v);e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},data);
 await pasteData({'text/html':'<html><head><style>td{color:red}</style></head><body><!--StartFragment--><table><col width=64><tr><td>Fruit</td><td>Price</td></tr><tr><td>Apple</td><td>2</td></tr></table><!--EndFragment--></body></html>','text/plain':'Fruit\tPrice\nApple\t2'});
 assert.equal((await shape()).length,2,'Pasted table kept as a table');
 assert.deepEqual((await shape())[1],[['TD:Fruit','TD:Price'],['TD:Apple','TD:2']]);
 await editor().evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);});
 await pasteData({'text/html':'<b>Plain paste marker</b>','text/plain':'Plain paste marker'});
 assert.ok((await editor().innerText()).includes('Plain paste marker'));
 assert.equal(await editor().evaluate(e=>Array.from(e.querySelectorAll('b,strong')).some(b=>b.textContent.includes('Plain paste'))),false,'Non-table pastes stay plain');
 pdf=await pdfPages();assert.ok(pdf.pages.some(p=>p.text.includes('Apple')),'Pasted table is in the PDF');

 // 3. Import a Word document: table with repeating header, formatting, alignment, and font.
 const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
 const para=(text,{align,bold}={})=>`<w:p>${align?`<w:pPr><w:jc w:val="${align}"/></w:pPr>`:''}<w:r>${bold?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
 const cell=text=>`<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${para(text)}</w:tc>`;
 const rows=['<w:tr><w:trPr><w:tblHeader/></w:trPr>'+['Item','Qty','Notes'].map(cell).join('')+'</w:tr>',...Array.from({length:45},(_,i)=>'<w:tr>'+[`Line item ${i+1}`,`${i+1} pcs`,i%9===0?'A longer note that needs to wrap onto several lines inside its cell so the row grows taller.':'OK'].map(cell).join('')+'</w:tr>')];
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
 zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 zip.file('word/styles.xml',`<?xml version="1.0"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Georgia"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`);
 zip.file('word/document.xml',`<?xml version="1.0"?><w:document ${W}><w:body>${para('QUARTERLY SUPPLY REPORT',{align:'center',bold:true})}${para('26 November 2026',{align:'right'})}${para('Please find the order below.')}<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>${rows.join('')}</w:tbl>${para('AFTER TABLE MARKER')}<w:sectPr/></w:body></w:document>`);
 await page.locator('#word-file').setInputFiles({name:'Supply report.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await zip.generateAsync({type:'nodebuffer'})});
 const notice=page.getByRole('status').filter({hasText:'Word document imported'});await notice.waitFor({timeout:60000});
 const noticeText=await notice.innerText();
 assert.ok(noticeText.includes('with 1 table'),noticeText);assert.ok(noticeText.includes('Georgia'),'Explains the font match: '+noticeText);
 assert.equal(await page.getByRole('combobox',{name:'Typeface'}).inputValue(),'Times New Roman','Georgia maps to the closest serif');
 assert.equal(await page.getByRole('combobox',{name:'Font size'}).inputValue(),'12','Word font size kept');
 const imported=await shape();assert.equal(imported.length,1);assert.equal(imported[0].length,46);assert.deepEqual(imported[0][0],['TH:Item','TH:Qty','TH:Notes']);
 const aligns=await editor().evaluate(e=>Array.from(e.children).slice(0,2).map(p=>[p.textContent,p.style.textAlign,!!p.querySelector('strong,b')]));
 assert.deepEqual(aligns,[['QUARTERLY SUPPLY REPORT','center',true],['26 November 2026','right',false]],'Alignment and bold kept');
 await page.locator('.document-editor').screenshot({path:output+'/editor-imported.png'});
 pdf=await pdfPages();
 assert.ok(pdf.pages.length>=2,'Long table continues onto another page');
 assert.ok(find(pdf.pages[1],'Item')&&find(pdf.pages[1],'Notes'),'Header row repeats on the next page');
 assert.ok(pdf.pages.at(-1).text.includes('AFTER TABLE MARKER'),'Text after the table follows it');
 const all=pdf.pages.flatMap(p=>p.items.map(i=>i.str)).join(' ');
 for(let i=1;i<=45;i++)assert.ok(all.includes(`Line item ${i}`),`Row ${i} present`);
 assert.ok(pdf.doc.context.enumerateIndirectObjects().some(([,o])=>o.toString().includes('/Times-Bold')),'Times bold used for the heading and header');
 const title=find(pdf.pages[0],'QUARTERLY'),date=find(pdf.pages[0],'26 November');
 assert.ok(title.x>120,'Centred title');assert.ok(date.x>300,'Right-aligned date');
 // A wrapped note makes its row taller than a single-line row.
 const p1=pdf.pages[0];const y=s=>{const hit=p1.items.find(i=>i.str.trim()===s);if(!hit)throw new Error("Not found on page 1: "+s+" in "+JSON.stringify(p1.items.slice(0,24).map(i=>i.str)));return hit.y;};
 {const a=y('1 pcs'),b=y('2 pcs'),c=y('3 pcs');assert.ok((a-b)>(b-c)+5,'Wrapped cell grows its row: '+JSON.stringify({a,b,c,items:p1.items.filter(i=>/pcs|longer|taller/.test(i.str)).slice(0,6)}));}
 await page.locator('.preview-column').screenshot({path:output+'/preview-imported.png'});
 await page.getByRole('button',{name:'Go to page 2',exact:true}).click();
 await page.getByRole('img',{name:'Generated letter, page 2'}).waitFor({timeout:60000});
 await page.locator('.preview-column').screenshot({path:output+'/preview-imported-page2.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal scroll on mobile');
 await page.locator('.document-editor').screenshot({path:output+'/editor-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,importedPages:pdf.pages.length,checks:['insert table','header row','Tab between cells','Tab adds a row','add/delete row and column','table in PDF with borders','bold header','paste spreadsheet table','plain paste stays plain','Word table import','repeating header row','Word alignment and bold','Word font matched and explained','Word font size kept','wrapped cells grow rows','mobile width']}));
}finally{await browser.close();}
