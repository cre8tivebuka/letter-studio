import {chromium,launchOptions,testUrl} from './browser-runtime.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument,rgb} from 'pdf-lib';
import assert from 'node:assert/strict';
const browser=await chromium.launch(launchOptions);
const context=await browser.newContext({viewport:{width:1440,height:1100},hasTouch:true});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
const output='outputs/resize-qa';await mkdir(output,{recursive:true});
const box=()=>page.getByRole('group',{name:'Writing area',exact:true});
const handle=name=>page.getByRole('button',{name:'Resize writing area '+name,exact:true});
const slider=name=>page.getByRole('slider',{name:name+' margin',exact:true});
const region=async()=>({
 left:Number(await slider('Left').inputValue())/100,
 right:1-Number(await slider('Right').inputValue())/100,
 top:Number(await slider('Top').inputValue())/100,
 bottom:1-Number(await slider('Bottom').inputValue())/100
});
const near=(a,b,tol=.002)=>assert.ok(Math.abs(a-b)<=tol,a+' should be near '+b);
async function drag(target,dx,dy,whileDown){
 await target.scrollIntoViewIfNeeded();const bounds=await target.boundingBox();
 const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});
 if(whileDown)await whileDown();
 await page.mouse.up();
}
async function pdfInfo(){
 await page.getByRole('link',{name:'Download PDF',exact:true}).waitFor({timeout:60000});
 const bytes=new Uint8Array(await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.querySelector('a[download]').href)).arrayBuffer()))));
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 const first=await pdf.getPage(1);const items=(await first.getTextContent()).items.filter(i=>'str'in i);
 const marker=items.find(i=>i.str.includes('ALIGNMENT MARKER'));
 const count=pdf.numPages;await pdf.destroy();
 assert.ok(marker,'PDF contains the letter text');assert.ok(bytes.length<1000000);
 return {x:marker.transform[4],y:marker.transform[5],pages:count,bytes};
}
try{
 await page.goto(testUrl);
 const blank=await PDFDocument.create();const sheet=blank.addPage([595,842]);
 sheet.drawText('LETTER STUDIO',{x:60,y:790,size:22,color:rgb(0,.28,1)});
 await page.locator('#letterhead-file').setInputFiles({name:'blank.pdf',mimeType:'application/pdf',buffer:Buffer.from(await blank.save())});
 await page.getByRole('img',{name:'Uploaded empty letterhead'}).waitFor({timeout:60000});
 const editor=page.getByRole('textbox',{name:'LETTER CONTENT'});
 await editor.fill('ALIGNMENT MARKER\n\n'+Array.from({length:24},(_,i)=>'Paragraph '+(i+1)+'. The writing area controls the position and wrapping of every line in this letter. All pages must follow the adjusted margins.').join('\n\n'));
 const before=await pdfInfo();
 await page.getByRole('button',{name:'Edit writing area in preview'}).click();
 assert.ok(await page.locator('.margin-settings').evaluate(e=>e.open));
 await box().waitFor();const paper=await page.locator('.paper').boundingBox();
 await drag(handle('top left'),paper.width*.08,paper.height*.06,async()=>{
  const current=await region();near(current.left,.18);near(current.top,.26);
  assert.equal(await page.getByRole('link',{name:'Download PDF',exact:true}).count(),0);
  assert.ok(await page.getByRole('img',{name:'Generated letter, page 1'}).isVisible(),'Keep the letter visible during dragging');
 });
 const after=await pdfInfo();assert.ok(after.x>before.x+40);assert.ok(after.y<before.y-40);assert.ok(after.pages>=before.pages);
 await writeFile(output+'/resized-letter.pdf',after.bytes);
 const firstPage=await page.getByRole('img',{name:'Generated letter, page 1'});
 await firstPage.waitFor();
 await page.locator('.preview-column').screenshot({path:output+'/resize-desktop.png'});
 await editor.fill('ALIGNMENT MARKER\n\nA short letter for bounds and keyboard checks.');
 await pdfInfo();
 // Drag outside the paper and confirm every edge remains inside the safe inset.
 let p=await page.locator('.paper').boundingBox();
 await drag(handle('top left'),-p.width,-p.height);
 let r=await region();near(r.left,.02);near(r.top,.02);
 p=await page.locator('.paper').boundingBox();
 await drag(handle('bottom right'),-p.width,-p.height);
 r=await region();near(r.right-r.left,.2);near(r.bottom-r.top,.16);
 const width=r.right-r.left,height=r.bottom-r.top;
 p=await page.locator('.paper').boundingBox();
 await drag(page.getByRole('button',{name:'Move writing area',exact:true}),p.width,p.height);
 r=await region();near(r.right,.98);near(r.bottom,.98);near(r.right-r.left,width);near(r.bottom-r.top,height);
 await page.getByRole('button',{name:'Reset margins'}).click();
 await handle('top').focus();await page.keyboard.press('ArrowDown');near((await region()).top,.21);
 await page.keyboard.press('Shift+ArrowDown');near((await region()).top,.26);
 await page.getByRole('button',{name:'Move writing area',exact:true}).focus();await page.keyboard.press('ArrowRight');
 r=await region();near(r.left,.11);near(r.right,.91);
 await page.getByRole('button',{name:'Reset margins'}).click();
 p=await page.locator('.paper').boundingBox();
 await drag(handle('right'),-p.width*.1,0,async()=>{await page.keyboard.press('Escape');});
 r=await region();near(r.right,.9);
 await slider('Left').fill('15');
 const b=await box().boundingBox();p=await page.locator('.paper').boundingBox();near((b.x-p.x)/p.width,.15,.004);
 await page.getByRole('button',{name:'Reset margins'}).click();
 // Real touch events exercise the same pointer-capture path on a mobile viewport.
 await page.setViewportSize({width:390,height:844});
 await handle('bottom right').scrollIntoViewIfNeeded();
 const touchBounds=await handle('bottom right').boundingBox();p=await page.locator('.paper').boundingBox();
 const tx=touchBounds.x+touchBounds.width/2,ty=touchBounds.y+touchBounds.height/2;
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-p.width*.1,y:ty-p.height*.1,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 r=await region();near(r.right,.8,.006);near(r.bottom,.78,.006);
 await pdfInfo();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('.preview-column').screenshot({path:output+'/resize-mobile.png'});
 await page.getByRole('button',{name:'Edit writing area in preview'}).click();
 assert.equal(await box().count(),0);assert.equal(await page.locator('.margin-settings').evaluate(e=>e.open),false);
 await page.getByRole('button',{name:'Add fonts',exact:true}).click();
 await page.locator('.font-dialog').screenshot({path:output+'/fonts-mobile.png'});
 assert.ok(await page.locator('.font-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,before:{x:before.x,y:before.y,pages:before.pages},after:{x:after.x,y:after.y,pages:after.pages},checks:['mouse resize','sliders synchronized during drag','visible letter while resizing','PDF coordinates updated','page reflow','edge bounds','minimum area','move box','keyboard nudging','Escape cancels drag','slider updates box','touch resize','mobile layout','hide controls']}));
}finally{await browser.close();}
