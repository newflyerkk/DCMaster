import {rgbaPNG} from './png-compat.mjs';
import {encodeGIF} from './gif.mjs';
import UPNG from 'upng-js';
import {visualError,pngProfiles} from './png-quality.mjs';
import initOxi,{optimise as oxi} from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';
import pngDecode,{init as initPNG} from '@jsquash/png/decode.js';
import webpEncode,{init as initWebP} from '@jsquash/webp/encode.js';
import webpDecode,{init as initWebPDec} from '@jsquash/webp/decode.js';
import jpegEncode,{init as initJPEG} from '@jsquash/jpeg/encode.js';
import oxiWasm from '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm';
import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import {simd} from 'wasm-feature-detect';
import webpSIMDWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm';
import webpWasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
import webpDecWasm from '@jsquash/webp/codec/dec/webp_dec.wasm';
import jpegWasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
import { PDFDocument } from 'pdf-lib';
import { optimize } from 'svgo/browser';
import { features, equalPixels, smaller } from './core.mjs';
let ready;
const bytes = b => Uint8Array.from(atob(b),c=>c.charCodeAt(0));
async function init() {
  ready ??= Promise.all([initOxi(bytes(oxiWasm)),initPNG(bytes(pngWasm)),initWebP({locateFile:p=>p,wasmBinary:bytes((await simd())?webpSIMDWasm:webpWasm)}),initWebPDec({locateFile:p=>p,wasmBinary:bytes(webpDecWasm)}),initJPEG({locateFile:p=>p,wasmBinary:bytes(jpegWasm)})]);
  await ready;
}
async function process(asset, settings) {
  if(asset.format==='gif'){
    await init();
    const frames=[];for(const source of asset.frames)frames.push(await pngDecode(new Uint8Array(source).buffer));
    const width=Math.max(...frames.map(f=>f.width)),height=Math.max(...frames.map(f=>f.height));
    const output=encodeGIF(frames,width,height,asset.delay||200);
    return {...asset,frames:undefined,bytes:output,size:output.length,originalSize:asset.frames.reduce((n,b)=>n+b.length,0),note:`${frames.length} 帧 · ${width}×${height} · ${asset.delay||200} ms/帧 · 循环播放 · 256 色有损`};
  }
  let input=new Uint8Array(asset.bytes), output, baseline=input, note='';
  const level={fast:1,balanced:3,deep:6}[settings.effort];
  if(asset.format==='mp4') return {...asset,bytes:input,originalSize:input.length,size:input.length,note:asset.note||'Figma MP4 · 无二次压缩'};
  if(asset.format==='svg') {
    const text=new TextDecoder().decode(input);
    const scaled=optimize(text,{plugins:[{name:'scale-root',fn:()=>({element:{enter(node){if(node.name==='svg') for(const key of ['width','height']) {const n=parseFloat(node.attributes[key]); if(Number.isFinite(n)) node.attributes[key]=String(n*asset.scale);}}}})}]}).data;
    baseline=new TextEncoder().encode(scaled);
    output=smaller(baseline,new TextEncoder().encode(optimize(scaled,{plugins:['removeComments','removeMetadata','removeEmptyAttrs'],multipass:true}).data));
    note='保留矢量 · 保守清理';
  } else if(asset.format==='pdf') {
    const doc=await PDFDocument.load(input,{updateMetadata:false});
    if(asset.scale!==1) doc.getPages().forEach(p=>p.scale(asset.scale,asset.scale));
    baseline=asset.scale===1?input:await doc.save({useObjectStreams:true});
    output=smaller(baseline,await doc.save({useObjectStreams:true}));
    note='保留矢量 · 对象流优化';
  } else {
    await init(); const image=await pngDecode(input.buffer); const f=features(image);
    if(asset.format==='png') {
      output=input;
      for(const l of (settings.effort==='deep'?[2,6]:[level])) {
        const candidate=oxi(input,l,false,false);
        if(candidate.length<output.length && equalPixels(image,await pngDecode(candidate.buffer))) output=candidate;
      }
      note='OxiPNG · 像素一致验证通过';
      // Re-encode exact palettes too; retain only byte-for-byte pixel-equivalent results.
      const exact=new Uint8Array(UPNG.encode([image.data.slice().buffer],image.width,image.height,0));
      const exactOptimized=oxi(exact,level,false,false);
      if(exactOptimized.length<output.length && equalPixels(image,await pngDecode(exactOptimized.buffer))) output=exactOptimized;
      if(settings.mode!=='lossless') {
        const profile=pngProfiles[settings.mode]||pngProfiles.balanced;
        let winnerError=null,winnerColors=0;
        for(const colors of profile.colors){
          const quantized=new Uint8Array(UPNG.encode([image.data.slice().buffer],image.width,image.height,colors));
          const candidate=oxi(quantized,settings.effort==='deep'?6:3,false,true);
          if(candidate.length>=output.length)continue;
          const decoded=await pngDecode(candidate.buffer);
          const error=visualError(image,decoded);
          if(error.rms<=profile.rms && error.max<=profile.max){output=candidate;winnerError=error;winnerColors=colors;}
        }
        note=winnerError?`PNG 减色 ≤${winnerColors} 色 · 有损 · 边缘误差 ${winnerError.max.toFixed(1)}/255`:'PNG · 无损候选更优，已保留';
      }

      if(output[25]===4){
        const decoded=await pngDecode(output.buffer);
        const compatible=rgbaPNG(decoded);
        if(!equalPixels(decoded,await pngDecode(compatible.buffer)))throw Error('PNG 兼容编码像素校验失败。');
        output=compatible;
        note+=' · RGBA 缩略图兼容编码';
      }
    } else if(asset.format==='webp') {
      const lossless=settings.mode==='lossless';
      const opts={lossless:lossless?1:0,exact:1,alpha_quality:100,near_lossless:100,method:settings.effort==='fast'?2:settings.effort==='deep'?6:4,image_hint:f.kind==='graphic'?3:f.kind==='photo'?2:0,quality:lossless?75:settings.mode==='quality'?(f.kind==='graphic'?94:88):settings.mode==='balanced'?(f.kind==='graphic'?88:80):(f.kind==='graphic'?82:72),use_sharp_yuv:1};
      output=new Uint8Array(await webpEncode(image,opts));
      if(settings.effort==='deep') output=smaller(output,new Uint8Array(await webpEncode(image,{...opts,quality:lossless?100:opts.quality,method:5})));
      if(!lossless) {
        const exactCandidate=new Uint8Array(await webpEncode(image,{...opts,lossless:1,quality:75,near_lossless:100,exact:1}));
        if(exactCandidate.length<output.length && equalPixels(image,await webpDecode(exactCandidate.buffer))) { output=exactCandidate; note='已选择更小的无损候选 · '; }
      }
      if(lossless && !equalPixels(image,await webpDecode(output.buffer))) throw new Error('WebP 像素一致性验证失败，未导出。');
      note+=`libwebp · ${lossless?'像素一致验证通过':'有损自适应'} · 相对 PNG 源图`;
    } else {
      const d=new Uint8ClampedArray(image.data); const bg=settings.background.match(/\w\w/g).map(v=>parseInt(v,16));
      for(let i=0;i<d.length;i+=4) {const a=d[i+3]/255;for(let c=0;c<3;c++)d[i+c]=Math.round(d[i+c]*a+bg[c]*(1-a));d[i+3]=255;}
      const flat=new ImageData(d,image.width,image.height);
      const q=settings.mode==='lossless'?100:settings.mode==='quality'?(f.kind==='graphic'?94:88):settings.mode==='balanced'?(f.kind==='graphic'?88:80):(f.kind==='graphic'?82:72);
      baseline=new Uint8Array(await jpegEncode(flat,{quality:100,auto_subsample:false,chroma_subsample:1,optimize_coding:false,progressive:false}));
      output=new Uint8Array(await jpegEncode(flat,{quality:q,auto_subsample:false,chroma_subsample:f.kind==='graphic'||settings.mode==='lossless'?1:2,optimize_coding:true,progressive:true,trellis_multipass:settings.effort==='deep'}));
      if(settings.mode==='lossless') note='JPEG 首次编码有损 · Q100';else note=`MozJPEG · 自适应 Q${q}`;
      note+=' · 相对 Q100 JPEG';
      output=smaller(baseline,output);
    }
  }
  return { ...asset, bytes:output, originalSize:baseline.length, size:output.length, note };
}
self.onmessage=async ({data})=>{try{const result=await process(data.asset,data.settings);self.postMessage({id:data.id,result});}catch(e){self.postMessage({id:data.id,error:e.message||String(e)});}};
