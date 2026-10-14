import {chromium} from '@playwright/test';import {readFile,writeFile,mkdir} from 'node:fs/promises';import UPNG from 'upng-js';import {visualError,pngProfiles} from '../src/png-quality.mjs';import {equalPixels} from '../src/core.mjs';
const files=['0867030e-ba93-4b9d-b123-5f94f2e2ce9b','b607ad1e-9f32-4e37-a103-3577f21356ba','e2ebfe49-0430-4bc3-8f1c-f7b73fdf7be4'];
const inputs=await Promise.all(files.map(async f=>Array.from(await readFile('tests/fixtures/'+f+'.png'))));
const browser=await chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage();await page.addInitScript(()=>{const W=Worker;window.Worker=class extends W{constructor(...args){super(...args);window.w=this;}};});await page.goto('file://'+process.cwd()+'/dist/ui.html');await page.click('#preview');
const results=await page.evaluate(async inputs=>{const out=[];for(let index=0;index<inputs.length;index++)for(const mode of ['lossless','quality','balanced','size']){
const r=await new Promise((resolve,reject)=>{window.w.onerror=e=>reject(Error(e.message));window.w.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.result);window.w.postMessage({asset:{bytes:new Uint8Array(inputs[index]),format:'png',scale:1,index,name:'sample'},settings:{mode,effort:'deep',background:'ffffff'}});});out.push({index,mode,size:r.size,note:r.note,bytes:Array.from(r.bytes)});}return out;},inputs);
await mkdir('tests/sample-results',{recursive:true});
function decode(bytes){const d=UPNG.decode(new Uint8Array(bytes).buffer);return {width:d.width,height:d.height,data:new Uint8Array(UPNG.toRGBA8(d)[0])};}
for(const r of results){const src=decode(inputs[r.index]),dst=decode(r.bytes);r.error=visualError(src,dst);if(r.mode==='lossless'&&!equalPixels(src,dst))throw Error('Not lossless');if(r.mode!=='lossless'&&(r.error.rms>pngProfiles[r.mode].rms||r.error.max>pngProfiles[r.mode].max))throw Error('Quality budget exceeded');if(r.size>inputs[r.index].length)throw Error('Larger output');await writeFile(`tests/sample-results/sample-${r.index+1}-${r.mode}.png`,new Uint8Array(r.bytes));delete r.bytes;}
console.log(JSON.stringify(results,null,2));await writeFile('tests/sample-results/results.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
