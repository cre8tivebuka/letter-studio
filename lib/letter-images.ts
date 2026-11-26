// Stamps and signatures placed on top of the letter. Positions are fractions of the page,
// so they stay put if the preview is resized. Height follows the image's own proportions.
export type ImagePages='last'|'first'|'all';
export type LetterImage={id:string;name:string;blob:Blob;url:string;format:'png'|'jpg';aspect:number;x:number;y:number;w:number;pages:ImagePages};
export type ImageHandle='move'|'resize';

export const MAX_IMAGE_FILE=5_000_000;
export const MAX_LETTER_IMAGES=6;
const MAX_IMAGE_SIDE=900;
const MIN_IMAGE_WIDTH=.04;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const snap=(value:number)=>Math.round(value*1000)/1000;

/** Height of an image as a fraction of the page height. pageAspect is page height / page width. */
export const imageHeight=(image:Pick<LetterImage,'w'|'aspect'>,pageAspect:number)=>image.w*image.aspect/pageAspect;

export function imageOnPage(image:Pick<LetterImage,'pages'>,page:number,pageCount:number){
 return image.pages==='all'||(image.pages==='first'&&page===1)||(image.pages==='last'&&page===pageCount);
}

export function placeImage(image:Pick<LetterImage,'x'|'y'|'w'|'aspect'>,pageAspect:number,handle:ImageHandle,dx:number,dy:number){
 let {x,y,w}=image;
 if(handle==='resize'){
  const maxW=Math.min(1-x,(1-y)*pageAspect/image.aspect);
  w=clamp(w+dx,MIN_IMAGE_WIDTH,Math.max(MIN_IMAGE_WIDTH,maxW));
 }else{
  const h=imageHeight({w,aspect:image.aspect},pageAspect);
  x=clamp(x+dx,0,Math.max(0,1-w));y=clamp(y+dy,0,Math.max(0,1-h));
 }
 return {x:snap(x),y:snap(y),w:snap(w)};
}

/** Open an uploaded PNG/JPG/WebP and return a compact copy. Transparent images stay PNG. */
export async function prepareLetterImage(file:File){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)&&!/\.(png|jpe?g|webp)$/i.test(file.name))throw new Error('Choose a PNG, JPG, or WebP image. Transparent PNGs work best for stamps and signatures.');
 if(!file.size)throw new Error('This image is empty. Please choose another file.');
 if(file.size>MAX_IMAGE_FILE)throw new Error('Choose an image smaller than 5 MB.');
 const source=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('This image could not be opened.'));el.src=source;});
  if(!img.naturalWidth||!img.naturalHeight)throw new Error('This image could not be opened.');
  const scale=Math.min(1,MAX_IMAGE_SIDE/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser cannot prepare this image.');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=false;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i]<255){transparent=true;break;}
  let format:'png'|'jpg'='png';
  if(!transparent){
   // Opaque images compress far better as JPEG on a white base.
   ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);format='jpg';
  }
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Unable to prepare this image.')),format==='png'?'image/png':'image/jpeg',.9));
  return {blob,format,aspect:canvas.height/canvas.width,name:file.name.replace(/\.[^.]+$/,'')||'Image'};
 }finally{URL.revokeObjectURL(source);}
}
