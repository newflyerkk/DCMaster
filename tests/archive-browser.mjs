import {existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {zipSync} from 'fflate';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:420,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+process.cwd()+'/dist/ui.html');
 await page.evaluate(()=>{
  window.postMessage({pluginMessage:{type:'preferences',value:{named:false,'scale-suffix':false,'import-create-frames':false,'gif-delay':'250'}}},'*');
  window.imported=[];
  window.addEventListener('message',e=>{if(e.data.pluginMessage?.type==='import-images')window.imported.push(e.data.pluginMessage);});
 });
 assert.equal(await page.locator('#named').isChecked(),false);
 assert.equal(await page.locator('#scale-suffix').isChecked(),false);
 assert.ok((await page.locator('#gif-rate').textContent()).includes('4 帧'));
 await page.click('#open-import');
 const archive={name:'素材.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'子目录/图.png':new Uint8Array([1,2,3]),'info.txt':new Uint8Array([4])}))};
 await page.locator('#import-files').setInputFiles(archive);
 await page.waitForFunction(()=>window.imported.length===1||document.getElementById('import-status').className==='error');
 assert.equal(await page.evaluate(()=>window.imported[0]?.files[0].name),'图.png',await page.locator('#import-status').textContent());
 assert.equal(await page.evaluate(()=>window.imported[0].createFrames),false);
 for(const name of ['lzma2.7z','v4.rar','v5.rar']) {
  if(!existsSync('/tmp/dc-archive-fixtures/'+name))continue;
  await page.evaluate(()=>window.postMessage({pluginMessage:{type:'import-result',count:1}},'*'));
  const before=await page.evaluate(()=>window.imported.length);
  await page.locator('#import-files').setInputFiles('/tmp/dc-archive-fixtures/'+name);
  await page.waitForFunction(n=>window.imported.length>n||document.getElementById('import-status').className==='error',before);
  assert.equal(await page.evaluate(()=>window.imported.length),before+1,await page.locator('#import-status').textContent());
 }
 await page.evaluate(()=>window.postMessage({pluginMessage:{type:'import-result',count:1}},'*'));
 const before=await page.evaluate(()=>window.imported.length);
 async function drop(modern) {
  await page.evaluate(modern=>{
   const brokenEntry={isDirectory:true,createReader:()=>({readEntries:(resolve,reject)=>reject(Error('Malformed URI'))})};
   const item={kind:'file',webkitGetAsEntry:()=>brokenEntry};
   if(modern)item.getAsFileSystemHandle=async()=>({kind:'directory',async *values(){yield {kind:'file',getFile:async()=>new File([new Uint8Array([1,2,3])],'现代目录.png')};}});
   const event=new Event('drop',{cancelable:true});
   Object.defineProperty(event,'dataTransfer',{value:{files:[],items:[item]}});
   window.dispatchEvent(event);
  },modern);
 }
 await drop(true);
 await page.waitForFunction(n=>window.imported.length>n,before);
 assert.equal(await page.evaluate(()=>window.imported.at(-1).files[0].name),'现代目录.png');
 await page.evaluate(()=>window.postMessage({pluginMessage:{type:'import-result',count:1}},'*'));
 await drop(false);
 await page.waitForFunction(()=>document.getElementById('import-status').className==='error');
 assert.ok((await page.locator('#import-status').textContent()).includes('选择文件夹'));
 assert.deepEqual(errors,[]);
 console.log('PASS: ZIP/RAR/7z import, preferences, GIF fps, modern directory fallback and actionable error');
} finally {await browser.close();}
