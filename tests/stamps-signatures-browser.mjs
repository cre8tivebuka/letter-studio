import {chromium,launchOptions,testUrl} from './browser-runtime.mjs';
import {mkdir} from 'node:fs/promises';
import {PDFDocument,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
const output='outputs/stamps-qa';await mkdir(output,{recursive:true});
const download=()=>page.getByRole('link',{name:'Download PDF',exact:true});
const placer=()=>page.getByRole('group',{name:'Place signature',exact:true});
const position=()=>placer().evaluate(e=>({left:parseFloat(e.style.left),top:parseFloat(e.style.top),width:parseFloat(e.style.width)}));
// Count image draws per page: the letterhead background is one, each stamp/signature adds one.
async function imagesPerPage(){
 await download().waitFor({timeout:60000});
 const bytes=new Uint8Array(await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.querySelector('a[download]').href)).arrayBuffer()))));
 assert.ok(bytes.length<1000000,'PDF stays below 1 MB');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:bytes}).promise;const counts=[];
 for(let n=1;n<=pdf.numPages;n++){const ops=await(await pdf.getPage(n)).getOperatorList();counts.push(ops.fnArray.filter(f=>f===pdfjs.OPS.paintImageXObject).length);}
 await pdf.destroy();return counts;
}
async function drag(target,dx,dy){
 const b=await target.boundingBox();const x=b.x+b.width/2,y=b.y+b.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();
}
try{
 await page.goto(testUrl);
 await page.getByRole('heading',{name:'Stamps & signatures'}).waitFor();
 assert.ok(await page.locator('.image-panel .upload-area').isDisabled(),'Images need a letterhead first');
 const blank=await PDFDocument.create();blank.addPage([595,842]).drawText('ACME STUDIO',{x:60,y:780,size:22,color:rgb(0,.28,1)});
 await page.locator('#letterhead-file').setInputFiles({name:'letterhead.pdf',mimeType:'application/pdf',buffer:Buffer.from(await blank.save())});
 await page.getByRole('img',{name:'Uploaded empty letterhead'}).waitFor({timeout:60000});
 await page.getByRole('textbox',{name:'LETTER CONTENT'}).fill(Array.from({length:40},(_,i)=>'Paragraph '+(i+1)+'. This letter runs over more than one page so the signature can be checked on the last page only.').join('\n\n'));
 const plain=await imagesPerPage();assert.ok(plain.length>=2);assert.ok(plain.every(c=>c===1));
 // Wrong file type is rejected with a clear message.
 await page.locator('#image-file').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});
 await page.getByRole('alert').filter({hasText:'Choose a PNG, JPG, or WebP image'}).waitFor();
 // A transparent PNG signature drawn in the browser.
 const png=Buffer.from((await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=160;const x=c.getContext('2d');x.strokeStyle='#1a2a8a';x.lineWidth=6;x.beginPath();x.moveTo(20,120);x.bezierCurveTo(90,10,150,150,220,60);x.bezierCurveTo(260,10,320,140,380,50);x.stroke();return c.toDataURL('image/png');})).split(',')[1],'base64');
 await page.locator('#image-file').setInputFiles({name:'signature.png',mimeType:'image/png',buffer:png});
 // Placing mode: image appears on the last page and Download waits for Done.
 await placer().waitFor({timeout:30000});
 assert.equal(await page.locator('.preview-status').innerText(),'Placing image…');
 assert.equal(await download().count(),0,'No download while placing');
 assert.ok((await page.locator('.page-navigation span').innerText()).match(/Page (\d+) of \1$/),'Opens on the last page');
 // The letter text stays visible under the image while placing.
 await page.getByRole('img',{name:/^Generated letter, page \d+$/}).waitFor({timeout:60000});
 await page.locator('.preview-column').screenshot({path:output+'/placing-desktop.png'});
 const start=await position();
 await drag(page.getByRole('button',{name:'Move signature',exact:true}),120,-80);
 const moved=await position();assert.ok(moved.left>start.left+5&&moved.top<start.top-3,'Image moves with the pointer');
 await drag(page.getByRole('button',{name:'Resize signature',exact:true}),60,0);
 const resized=await position();assert.ok(resized.width>moved.width+3,'Corner resizes the image');
 await page.getByRole('button',{name:'Move signature',exact:true}).focus();await page.keyboard.press('ArrowLeft');
 assert.ok(Math.abs((await position()).left-(resized.left-1))<.2,'Arrow keys nudge the image');
 await page.locator('.image-done').click();
 assert.equal(await placer().count(),0,'Done leaves placing mode');
 const lastOnly=await imagesPerPage();
 assert.equal(lastOnly.at(-1),2,'Signature on the last page');assert.ok(lastOnly.slice(0,-1).every(c=>c===1),'Not on earlier pages');
 await page.locator('.preview-column').screenshot({path:output+'/placed-desktop.png'});
 await page.getByRole('combobox',{name:'Pages for signature'}).selectOption('all');
 assert.ok((await imagesPerPage()).every(c=>c===2),'Signature on every page');
 await page.getByRole('combobox',{name:'Pages for signature'}).selectOption('first');
 const first=await imagesPerPage();assert.equal(first[0],2);assert.ok(first.slice(1).every(c=>c===1));
 // Move again from the list, then confirm with the list button.
 await page.getByRole('button',{name:'Move signature',exact:false}).first().waitFor();
 await page.locator('.image-list').getByRole('button',{name:'Move signature',exact:true}).click();
 await placer().waitFor();assert.equal(await page.locator('.page-navigation span').innerText().then(t=>t.startsWith('Page 1 ')),true,'Opens on its page');
 await page.locator('.image-list').getByRole('button',{name:'Done placing signature',exact:true}).click();
 await imagesPerPage();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal scroll on mobile');
 await page.locator('.image-panel').screenshot({path:output+'/image-panel-mobile.png'});
 await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'Remove signature',exact:true}).click();
 assert.ok((await imagesPerPage()).every(c=>c===1),'Removed image leaves the PDF');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,pages:plain.length,checks:['needs letterhead first','invalid image feedback','transparent PNG upload','opens on last page','no download while placing','drag to move','corner resize','keyboard nudge','Done confirms placement','last page only','every page','first page only','re-place from list','mobile width','remove image']}));
}finally{await browser.close();}
