import UPNG from 'upng-js';
// GIF89a with a per-frame adaptive palette and transparent index 0.
// Clear LZW every 200 literals so the code width stays at 9 bits.
export function encodeGIF(frames,width,height,delay=200){
 if(!frames.length||width<1||height<1||width>4096||height>4096||width*height*frames.length>32_000_000)throw Error('GIF 画布过大，请减少倍率或帧数。');
 const out=[],put=(...v)=>out.push(...v),word=v=>put(v&255,v>>8),ascii=s=>{for(const c of s)put(c.charCodeAt(0));};
 ascii('GIF89a');word(width);word(height);put(0x70,0,0);
 put(0x21,0xff,11);ascii('NETSCAPE2.0');put(3,1,0,0,0);
 for(const frame of frames){
  const rgba=new Uint8Array(frame.data.length),colors=new Map();
  for(let p=0;p<rgba.length;p+=4){const a=frame.data[p+3]/255;if(!a)continue;for(let c=0;c<3;c++)rgba[p+c]=Math.round(frame.data[p+c]*a+255*(1-a));rgba[p+3]=255;const key=(rgba[p]<<16)|(rgba[p+1]<<8)|rgba[p+2];if(colors.size<=255)colors.set(key,[rgba[p],rgba[p+1],rgba[p+2]]);}
  let palette;
  if(colors.size<=255)palette=[...colors.values()];
  else {const quantized=UPNG.quantize([rgba.buffer],255,false);palette=quantized.plte.map(n=>{const v=n.est.rgba;return [v&255,(v>>>8)&255,(v>>>16)&255];});}
  if(!palette.length)palette=[[0,0,0]];
  const cache=new Map(),exact=colors.size<=255;
  const nearest=(r,g,b)=>{const key=exact?((r<<16)|(g<<8)|b):((r>>3)<<10)|((g>>3)<<5)|(b>>3);if(cache.has(key))return cache.get(key);let best=0,error=Infinity;for(let i=0;i<palette.length;i++){const c=palette[i],e=(r-c[0])**2+(g-c[1])**2+(b-c[2])**2;if(e<error){error=e;best=i;}}cache.set(key,best+1);return best+1;};

  put(0x21,0xf9,4,9);word(Math.max(2,Math.round(delay/10)));put(0,0,0x2c);word(0);word(0);word(width);word(height);put(0x87);
  put(0,0,0);for(let i=0;i<255;i++){const c=palette[i]||[0,0,0];put(...c);}put(8);
  let bits=0,count=0;const compressed=[];
  const code=v=>{bits|=v<<count;count+=9;while(count>=8){compressed.push(bits&255);bits>>>=8;count-=8;}};
  let literals=0;code(256);
  const dx=Math.floor((width-frame.width)/2),dy=Math.floor((height-frame.height)/2);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   let index=0;const fx=x-dx,fy=y-dy;
   if(fx>=0&&fy>=0&&fx<frame.width&&fy<frame.height){const p=(fy*frame.width+fx)*4,d=rgba;if(d[p+3]){const matrix=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],noise=exact?0:(matrix[(fy%4)*4+fx%4]-7.5)*1.5;index=nearest(...[d[p],d[p+1],d[p+2]].map(v=>Math.max(0,Math.min(255,Math.round(v+noise)))));}}
   code(index);if(++literals===200){code(256);literals=0;}
  }
  code(257);if(count)compressed.push(bits&255);
  for(let i=0;i<compressed.length;i+=255){const chunk=compressed.slice(i,i+255);put(chunk.length);for(const byte of chunk)put(byte);}put(0);
 }
 put(0x3b);return new Uint8Array(out);
}
