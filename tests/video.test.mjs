import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {manifestIdentity,parsePlaylist,chooseVariant} from '../extension/src/hls.mjs';import {downloadVideo} from '../extension/src/download.mjs';
const base='https://www.figma.com/api/files/example/videos/abc/manifest';
test('只识别 Figma 视频播放地址',()=>{assert.equal(manifestIdentity(base).hash,'abc');assert.equal(manifestIdentity('https://evil.example/api/files/example/videos/abc/manifest'),null);assert.equal(manifestIdentity('https://www.figma.com/api/other'),null);});
test('清晰度、相对地址与独立音轨',()=>{const p=parsePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=200,CODECS="avc1.64001f,mp4a.40.2"\nhigh.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8',base);assert.match(chooseVariant(p).url,/high/);assert.match(chooseVariant(p,'small').url,/low/);p.audio=[{'GROUP-ID':'a',URI:'a.m3u8'}];p.variants[0].audio='a';assert.throws(()=>chooseVariant(p),/独立音轨/);});
test('加密、直播、错误地址和断续时间线不能静默生成损坏文件',()=>{for(const body of ['#EXT-X-KEY:METHOD=AES-128,URI="key"\na.ts\n#EXT-X-ENDLIST','a.ts','#EXT-X-DISCONTINUITY\na.ts\n#EXT-X-ENDLIST','http://localhost/a.ts\n#EXT-X-ENDLIST'])assert.throws(()=>parsePlaylist('#EXTM3U\n'+body,base));});
test('字节范围计算',()=>{const p=parsePlaylist('#EXTM3U\n#EXT-X-BYTERANGE:20@0\na.ts\n#EXT-X-BYTERANGE:10\na.ts\n#EXT-X-ENDLIST',base);assert.deepEqual(p.segments[1].range,{length:10,offset:20});});
for(const kind of ['ts','fmp4'])test(`${kind} 完整下载、MP4 封装、时长和音画解码`,async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push(options);const file=new URL(url).pathname.split('/').at(-1);const bytes=await readFile('tests/video-fixtures/'+file);return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
 const result=await downloadVideo('https://www.figma.com/'+kind+'.m3u8',{fetcher});const output='tests/video-fixtures/'+kind+'-output.mp4';await writeFile(output,new Uint8Array(await result.blob.arrayBuffer()));
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
 assert.ok(probe.streams.some(s=>s.codec_name==='h264'&&s.width===160));assert.ok(probe.streams.some(s=>s.codec_name==='aac'));assert.ok(Number(probe.format.duration)>=2.9&&Number(probe.format.duration)<3.3);
 execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-']);assert.ok(calls.every(c=>c.credentials==='same-origin'));
});
test('鉴权失败、超限和取消均不生成文件',async()=>{
 await assert.rejects(downloadVideo(base,{fetcher:async()=>new Response('',{status:403})}),/403/);
 const signal=AbortSignal.abort();await assert.rejects(downloadVideo(base,{signal}));
 await assert.rejects(downloadVideo(base,{fetcher:async()=>new Response('a',{headers:{'content-length':'2000000'}})}),/过大/);
});
function boxes(buffer,start=0,end=buffer.length){const result=[];for(let p=start;p+8<=end;){const n=buffer.readUInt32BE(p);if(n<8||p+n>end)throw Error('Invalid box');result.push({type:buffer.toString('ascii',p+4,p+8),start:p,end:p+n});p+=n;}return result;}
test('MP4 必须具有真实时长与普通样本索引，不包含流媒体时长占位值',async()=>{
 for(const kind of ['ts','fmp4']){
  const b=await readFile(`tests/video-fixtures/${kind}-output.mp4`);const top=boxes(b);assert.ok(!top.some(x=>x.type==='moof'));assert.ok(top.findIndex(x=>x.type==='moov')<top.findIndex(x=>x.type==='mdat'));
  function inspect(start,end){for(const box of boxes(b,start,end)){
   const p=box.start+8;
   if(['moov','trak','mdia','minf','stbl'].includes(box.type))inspect(p,box.end);
   if(['mvhd','mdhd'].includes(box.type)){assert.equal(b[p],0);const timescale=b.readUInt32BE(p+12),duration=b.readUInt32BE(p+16);assert.ok(duration>0&&duration!==0xffffffff);assert.ok(duration/timescale<4);}
   if(box.type==='stsz')assert.ok(b.readUInt32BE(p+8)>0);
  }}inspect(0,b.length);
 }
});
