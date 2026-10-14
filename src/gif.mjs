// GIF89a with a deterministic 3/3/2-bit palette and transparent index 0.
// Clear LZW every 200 literals so the code width stays at 9 bits.
export function encodeGIF(frames,width,height,delay=200){
 if(!frames.length||width<1||height<1||width>4096||height>4096||width*height*frames.length>32_000_000)throw Error('GIF 画布过大，请减少倍率或帧数。');
 const out=[],put=(...v)=>out.push(...v),word=v=>put(v&255,v>>8),ascii=s=>{for(const c of s)put(c.charCodeAt(0));};
 ascii('GIF89a');word(width);word(height);put(0xf7,0,0);
 for(let i=0;i<256;i++)put(Math.round((i>>5)*255/7),Math.round(((i>>2)&7)*255/7),Math.round((i&3)*255/3));
 put(0x21,0xff,11);ascii('NETSCAPE2.0');put(3,1,0,0,0);
 for(const frame of frames){
  put(0x21,0xf9,4,9);word(Math.max(2,Math.round(delay/10)));put(0,0,0x2c);word(0);word(0);word(width);word(height);put(0,8);
  let bits=0,count=0;const compressed=[];
  const code=v=>{bits|=v<<count;count+=9;while(count>=8){compressed.push(bits&255);bits>>>=8;count-=8;}};
  let literals=0;code(256);
  const dx=Math.floor((width-frame.width)/2),dy=Math.floor((height-frame.height)/2);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   let index=0;const fx=x-dx,fy=y-dy;
   if(fx>=0&&fy>=0&&fx<frame.width&&fy<frame.height){const p=(fy*frame.width+fx)*4,d=frame.data;if(d[p+3]>=128){index=((d[p]>>5)<<5)|((d[p+1]>>5)<<2)|(d[p+2]>>6);if(index===0)index=1;}}
   code(index);if(++literals===200){code(256);literals=0;}
  }
  code(257);if(count)compressed.push(bits&255);
  for(let i=0;i<compressed.length;i+=255){const chunk=compressed.slice(i,i+255);put(chunk.length);for(const byte of chunk)put(byte);}put(0);
 }
 put(0x3b);return new Uint8Array(out);
}
