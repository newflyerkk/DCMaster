import test from 'node:test';import assert from 'node:assert/strict';import UPNG from 'upng-js';import {rgbaPNG} from '../src/png-compat.mjs';
test('RGBA 兼容 PNG 保留所有透明度和隐藏 RGB，且不使用灰度编码',()=>{
 const width=32,height=8,data=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?Math.floor(i/4)%256:(i*17)%256);
 const encoded=rgbaPNG({width,height,data});assert.equal(encoded[25],6);
 const decoded=UPNG.decode(encoded.buffer);assert.deepEqual(new Uint8Array(UPNG.toRGBA8(decoded)[0]),data);
});
