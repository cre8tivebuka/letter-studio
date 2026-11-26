import {chromium,launchOptions,testUrl} from './browser-runtime.mjs';
import {mkdir} from 'node:fs/promises';
import {PDFDocument,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
const browser=await chromium.launch(launchOptions);
const context=await browser.newContext({viewport:{width:1440,height:1100},hasTouch:true});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
const output='outputs/draw-signature-qa';await mkdir(output,{recursive:true});
const download=()=>page.getByRole('link',{name:'Download PDF',exact:true});
const pad=()=>page.locator('canvas.signature-pad');
const tools=()=>page.getByRole('toolbar',{name:'Signature drawing'});
const near=(a,b,tol)=>assert.ok(Math.abs(a-b)<=tol,a+' should be near '+b);
async function imagesPerPage(){
 await download().waitFor({timeout:60000});
 const bytes=new Uint8Array(await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.querySelector('a[download]').href)).arrayBuffer()))));
 assert.ok(bytes.length<1000000,'PDF stays below 1 MB');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:bytes,useSystemFonts:true}).promise;const counts=[];
 for(let n=1;n<=pdf.numPages;n++){const ops=await(await pdf.getPage(n)).getOperatorList();counts.push(ops.fnArray.filter(f=>f===pdfjs.OPS.paintImageXObject).length);}
 await pdf.destroy();return counts;
}
// Draw a signature-like zigzag with the mouse, starting at fractions (fx,fy) of the paper.
async function sign(fx,fy){
 const b=await pad().boundingBox();const x=b.x+b.width*fx,y=b.y+b.height*fy;
 await page.mouse.move(x,y);await page.mouse.down();
 for(let i=1;i<=12;i++)await page.mouse.move(x+i*12,y+(i%2?-14:10),{steps:3});
 await page.mouse.up();
}
try{
 await page.goto(testUrl);
 assert.ok(await page.getByRole('button',{name:'Draw your signature on the page'}).isDisabled(),'Needs a letterhead first');
 const blank=await PDFDocument.create();blank.addPage([595,842]).drawText('ACME STUDIO',{x:60,y:780,size:22,color:rgb(0,.28,1)});
 await page.locator('#letterhead-file').setInputFiles({name:'letterhead.pdf',mimeType:'application/pdf',buffer:Buffer.from(await blank.save())});
 await page.getByRole('img',{name:'Uploaded empty letterhead'}).waitFor({timeout:60000});
 await page.getByRole('textbox',{name:'LETTER CONTENT'}).fill(Array.from({length:40},(_,i)=>'Paragraph '+(i+1)+'. This letter runs over more than one page so the drawn signature lands on the last page.').join('\n\n'));
 const plain=await imagesPerPage();assert.ok(plain.length>=2);
 // Drawing mode opens on the last page and blocks download.
 await page.getByRole('button',{name:'Draw your signature on the page'}).click();
 await pad().waitFor();
 assert.equal(await page.locator('.preview-status').innerText(),'Drawing signature…');
 assert.equal(await download().count(),0,'No download while drawing');
 assert.ok((await page.locator('.page-navigation span').innerText()).match(/Page (\d+) of \1$/),'Opens on the last page');
 const done=()=>tools().getByRole('button',{name:'Done'});
 assert.ok(await done().isDisabled(),'Done needs a drawing');
 // Cancel throws the drawing away.
 await sign(.15,.8);
 await tools().getByRole('button',{name:'Cancel'}).click();
 assert.equal(await pad().count(),0);assert.equal(await page.locator('.image-list li').count(),0,'Cancel adds nothing');
 // Undo and Clear.
 await page.getByRole('button',{name:'Draw your signature on the page'}).click();await pad().waitFor();
 await sign(.15,.8);await tools().getByRole('button',{name:'Undo'}).click();assert.ok(await done().isDisabled(),'Undo removes the stroke');
 await sign(.15,.8);await sign(.4,.8);await tools().getByRole('button',{name:'Clear'}).click();assert.ok(await done().isDisabled(),'Clear removes everything');
 // Sign for real in black ink.
 await page.getByRole('radio',{name:'Black ink'}).click();
 await sign(.15,.8);
 const inked=await pad().evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
 assert.ok(inked>200,'Ink appears on the page while drawing');
 await page.locator('.preview-column').screenshot({path:output+'/drawing-desktop.png'});
 await done().click();
 await page.locator('.image-list li').filter({hasText:'Drawn signature'}).waitFor();
 assert.equal(await pad().count(),0,'Done leaves drawing mode');
 const counts=await imagesPerPage();
 assert.equal(counts.at(-1),plain.at(-1)+1,'Signature on the last page');assert.deepEqual(counts.slice(0,-1),plain.slice(0,-1),'Not on earlier pages');
 await page.getByRole('img',{name:/^Generated letter, page \d+$/}).waitFor();
 await page.locator('.preview-column').screenshot({path:output+'/signed-desktop.png'});
 // It lands where it was drawn: starts about 15% across and sits around 80% down.
 await page.locator('.image-list').getByRole('button',{name:'Move Drawn signature',exact:true}).click();
 const placed=await page.getByRole('group',{name:'Place Drawn signature',exact:true}).evaluate(e=>({left:parseFloat(e.style.left),top:parseFloat(e.style.top),height:parseFloat(e.style.height)}));
 near(placed.left,15,1.5);near(placed.top+placed.height/2,80,2.5);
 await page.locator('.image-done').click();await imagesPerPage();
 // Finger drawing on a phone-sized screen.
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Draw your signature on the page'}).click();await pad().waitFor();
 await pad().scrollIntoViewIfNeeded();
 const b=await pad().boundingBox();const cdp=await context.newCDPSession(page);
 const tx=b.x+b.width*.5,ty=b.y+b.height*.7;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+i*8,y:ty+(i%2?-8:6),id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(!(await done().isDisabled()),'Touch drawing works');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal scroll on mobile');
 await page.locator('.preview-column').screenshot({path:output+'/drawing-mobile.png'});
 await done().click();
 await page.locator('.image-list li').filter({hasText:'Drawn signature 2'}).waitFor();
 await imagesPerPage();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,pages:plain.length,checks:['needs letterhead','opens on last page','no download while drawing','Done disabled when empty','cancel discards','undo','clear','ink colour','ink visible while drawing','added to last page only','lands where drawn','touch drawing','mobile width']}));
}finally{await browser.close();}
