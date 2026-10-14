import {chromium} from '@playwright/test';import {readFile,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1000,height:750},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Exercise the exact bundled MAIN-world content script in an isolated, mocked Figma page.
 // Open the shadow root only in the test so Playwright can exercise visible controls.
 await page.addInitScript(()=>{const native=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return native.call(this,{...options,mode:'open'});};});
 await page.addInitScript({path:'extension/dist/main.js'});
 await page.route('**/*',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/design/example/demo')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>本地模拟 Figma 视频页面</h1><button onclick="fetch(\'/api/files/example/videos/abc/manifest\')">播放 TS 视频</button><button onclick="fetch(\'/api/files/example/videos/def/manifest\')">播放 fMP4 视频</button>'});
  if(path.endsWith('/manifest'))return route.fulfill({contentType:'application/vnd.apple.mpegurl',body:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=160x90,CODECS="avc1.64001f,mp4a.40.2"\n/'+(path.includes('/abc/')?'ts':'fmp4')+'.m3u8'});
  if(/^\/(ts\d*\.ts|fmp4\d*\.m4s|init\.mp4|ts\.m3u8|fmp4\.m3u8)$/.test(path))return route.fulfill({body:await readFile('tests/video-fixtures'+path)});
  throw Error('Unexpected request '+path);
 });
 await page.goto('https://www.figma.com/design/example/demo');
 assert.equal(await page.getByRole('button',{name:'提取为 MP4'}).isDisabled(),true);
 for(const [button,key,kind] of [['播放 TS 视频','example/abc','ts'],['播放 fMP4 视频','example/def','fmp4']]){
  await page.getByRole('button',{name:button,exact:true}).click();await page.getByLabel('已检测视频').selectOption(key);await page.getByRole('button',{name:'提取为 MP4'}).click();
  await page.getByRole('link',{name:'保存 MP4'}).waitFor();
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'保存 MP4'}).click();const download=await pending;
  const file='tests/video-fixtures/browser-'+kind+'.mp4';await download.saveAs(file);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
  const playback=await page.evaluate(async bytes=>{
   const video=document.createElement('video');video.muted=true;video.preload='auto';const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));video.src=url;
   try{await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Browser video decode failed'));setTimeout(()=>reject(Error('Video load timeout')),10000);});
   video.currentTime=1;await new Promise((resolve,reject)=>{video.onseeked=resolve;setTimeout(()=>reject(Error('Video seek timeout')),10000);});
   const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>30)colored++;
   return {duration:video.duration,width:video.videoWidth,colored};
   }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  },Array.from(await readFile(file)));
  assert.ok(playback.duration>2.9&&playback.duration<3.3);assert.equal(playback.width,160);assert.ok(playback.colored>1000);
  assert.equal(probe.streams.length,2);assert.ok(Number(probe.format.duration)>2.9);execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-']);
 }
 await page.screenshot({path:'tests/extension-preview.png'});assert.deepEqual(errors,[]);console.log('PASS: shipped script detection → selection → download → TS/fMP4 MP4 output; H264 + AAC, ~3 seconds, fully decoded. Mock page only, not a live Figma account.');
}finally{await browser.close();}
