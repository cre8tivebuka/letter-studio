export const MAX_FONT_BYTES=5_000_000;
/** Validate SFNT table bounds before passing user files to the font parser. */
export function validateFont(bytes:Uint8Array):'ttf'|'otf'{
 if(bytes.length<28||bytes.length>MAX_FONT_BYTES)throw new Error('Choose a TTF or OTF font smaller than 5 MB.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const magic=v.getUint32(0);const format=magic===0x00010000?'ttf':magic===0x4f54544f?'otf':null;
 if(!format)throw new Error('This is not a supported TTF or OTF font. Download the desktop font file, not a ZIP, CSS link, or WOFF webfont.');
 const count=v.getUint16(4);if(count<1||count>256||12+count*16>bytes.length)throw new Error('The font file is damaged.');
 const tables=new Set<string>();for(let i=0;i<count;i++){const pos=12+i*16;const name=String.fromCharCode(...bytes.subarray(pos,pos+4));const offset=v.getUint32(pos+8),length=v.getUint32(pos+12);if(offset>bytes.length||length>bytes.length-offset)throw new Error('The font file is incomplete.');tables.add(name);if(name==='OS/2'&&length>=10){const flags=v.getUint16(offset+8);if(flags&0x0002||flags&0x0200)throw new Error('This font disallows document embedding. Choose an embeddable version.');if(flags&0x0100)throw new Error('This font disallows subsetting. Choose a font that permits subsetting for compact PDFs.');}}
 if(!['cmap','head','hhea','hmtx','maxp','name'].every(t=>tables.has(t))||(!tables.has('glyf')&&!tables.has('CFF ')))throw new Error('This font format is not supported. Use a static TTF or OTF version.');
 if(tables.has('fvar'))throw new Error('Choose a static weight of this font, such as Regular, rather than the variable font version.');
 return format;
}
