import {chromium} from '@playwright/test';import {PDFDocument} from 'pdf-lib';import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:520,height:1000}});const errors=[];page.on('console',m=>{if(m.type()==='error')console.error(m.text());});page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(() => { const NativeWorker=window.Worker; window.Worker=class extends NativeWorker { constructor(...args){super(...args);window.productionWorker=this;} }; });
await page.goto('file://'+process.cwd()+'/dist/ui.html');
await page.evaluate(()=>window.postMessage({pluginMessage:{type:'selection',nodes:[{id:'1',name:'示例卡片',width:64,height:64}]}},'*'));
if(await page.locator('input[name="preset"]').count()!==4)throw Error('Missing presets');
if(await page.locator('#jpeg-options').isVisible())throw Error('JPEG options should be hidden');
await page.locator('#formats input[value="jpeg"]').check();
if(!await page.locator('#jpeg-options').isVisible())throw Error('JPEG options should be shown');
await page.locator('#formats input[value="jpeg"]').uncheck();
await page.locator('#formats input[value="mp4"]').check();
if(!await page.locator('#video-options').isVisible())throw Error('Missing video settings');
await page.locator('#formats input[value="mp4"]').uncheck();
if(await page.locator('#video-options').isVisible())throw Error('Video settings not hidden');
await page.screenshot({path:'tests/ui-preview.png',fullPage:true});
await page.click('#preview');
await page.waitForFunction(()=>!!window.productionWorker);
await page.waitForTimeout(300);
if((await page.locator('#status').textContent()).includes('失败'))throw Error(await page.locator('#status').textContent());
const doc=await PDFDocument.create();doc.addPage([100,50]).drawRectangle({x:1,y:1,width:30,height:20});const pdf=Array.from(await doc.save());
const results=await page.evaluate(async({pdf})=>{
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#d13280';ctx.fillRect(5,5,40,40);const blob=await new Promise(r=>canvas.toBlob(r));const png=new Uint8Array(await blob.arrayBuffer());
 const w=window.productionWorker;const out=[];
 for(const format of ['png','webp','jpeg','svg','pdf'])for(const mode of ['lossless','quality','balanced','size']){
  const bytes=format==='pdf'?new Uint8Array(pdf):format==='svg'?new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><!--test--><path d="M0 0H100V50Z" fill="red"/></svg>'):png;
  const r=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout '+format)),60000);w.onerror=e=>reject(Error(e.message));w.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(format+' '+mode+': '+e.data.error)):resolve(e.data.result);};w.postMessage({asset:{format,scale:2,index:0,name:'test',bytes},settings:{mode,effort:'balanced',background:'ffffff'}});});
  out.push({format,mode,size:r.size,originalSize:r.originalSize,note:r.note,bytes:(format==='pdf'||format==='svg')?Array.from(r.bytes):undefined});
 }w.terminate();return out;
},{pdf});
for(const r of results){if(!r.size)throw Error('Empty output');if(r.format==='pdf'){const d=await PDFDocument.load(new Uint8Array(r.bytes));if(d.getPage(0).getWidth()!==200||d.getPage(0).getHeight()!==100)throw Error('PDF dimensions');}if(r.format==='svg'&&!new TextDecoder().decode(new Uint8Array(r.bytes)).includes('width="200"'))throw Error('SVG dimensions');delete r.bytes;}
console.log(JSON.stringify({results,errors},null,2));await writeFile('tests/browser-results.json',JSON.stringify({results,errors},null,2));await browser.close();if(errors.length)process.exitCode=1;
