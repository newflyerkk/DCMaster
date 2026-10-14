import {zlibSync} from 'fflate';
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){
 const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);
 for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(data,8);
 let crc=0xffffffff;for(let i=4;i<out.length-4;i++)crc=table[(crc^out[i])&255]^(crc>>>8);v.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
// Keep explicit RGBA instead of grayscale+alpha for macOS thumbnail compatibility.
export function rgbaPNG(image){
 const {width,height,data}=image,header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const stride=width*4,scan=new Uint8Array((stride+1)*height);
 for(let y=0;y<height;y++){const row=y*(stride+1);scan[row]=1;for(let x=0;x<stride;x++)scan[row+1+x]=(data[y*stride+x]-(x>=4?data[y*stride+x-4]:0))&255;}
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('sRGB',new Uint8Array([0])),chunk('IDAT',zlibSync(scan,{level:9})),chunk('IEND',new Uint8Array())];
 const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
