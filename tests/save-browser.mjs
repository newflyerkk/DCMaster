import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:420,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+process.cwd()+'/dist/ui.html');
 await page.evaluate(()=>{
  window.postMessage({pluginMessage:{type:'preferences'}},'*');window.acks=0;window.expected=1;
  window.addEventListener('message',e=>{if(e.data.pluginMessage?.type==='ack'&&++window.acks===window.expected)window.postMessage({pluginMessage:{type:'done'}},'*');});
 });
 await page.waitForFunction(()=>!document.getElementById('preview').disabled);
 assert.equal(await page.locator('#preview').textContent(),'预览');assert.equal(await page.locator('#download').textContent(),'保存');
 assert.ok(await page.locator('#preview').evaluate(e=>e.classList.contains('primary')));assert.ok(await page.locator('#download').isDisabled());
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=16;c.height=16;c.getContext('2d').fillRect(2,2,12,12);const b=await new Promise(r=>c.toBlob(r));return Array.from(new Uint8Array(await b.arrayBuffer()));});
 async function preview(count,mode){
  await page.evaluate(count=>{window.acks=0;window.expected=count;window.postMessage({pluginMessage:{type:'selection',nodes:Array.from({length:count},(_,i)=>({id:String(i),name:'图'+i,width:16,height:16}))}},'*');},count);
  await page.locator(`input[name="preset"][value="${mode}"]`).check();await page.click('#preview');
  await page.evaluate(({bytes,count,mode})=>{for(let i=0;i<count;i++)window.postMessage({pluginMessage:{type:'asset',bytes:new Uint8Array(bytes),native:mode==='none',format:'png',scale:1,index:i,name:'图'+i,total:count}},'*');},{bytes,count,mode});
  await page.waitForFunction(()=>!document.getElementById('download').disabled);
 }
 await preview(1,'none');
 assert.equal(await page.locator('#results img').count(),1);assert.equal(await page.locator('#results figcaption').textContent(),'导出效果');assert.ok(!(await page.locator('#summary').textContent()).includes('节省'));assert.ok(!(await page.locator('#preview').evaluate(e=>e.classList.contains('primary'))));assert.ok(await page.locator('#download').evaluate(e=>e.classList.contains('primary')));
 let waiting=page.waitForEvent('download');await page.click('#download');const file=await waiting;assert.equal(file.suggestedFilename(),'图0.png');assert.deepEqual(new Uint8Array(await readFile(await file.path())),new Uint8Array(bytes));
 await page.locator('#scale-suffix').uncheck();assert.ok(await page.locator('#download').isDisabled());assert.ok(await page.locator('#preview').evaluate(e=>e.classList.contains('primary')));
 await preview(2,'lossless');assert.equal(await page.locator('#results img').count(),4);waiting=page.waitForEvent('download');await page.click('#download');const zip=await waiting;assert.equal(zip.suggestedFilename(),'DC Master.zip');const z=await readFile(await zip.path());assert.equal(z[0],80);assert.equal(z[1],75);assert.deepEqual(errors,[]);console.log('PASS: native direct save, multi-object ZIP, output-only preview, button states and invalidation');
}finally{await browser.close();}
