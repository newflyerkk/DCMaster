import test from 'node:test';import assert from 'node:assert/strict';import {encodeGIF} from '../src/gif.mjs';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
test('GIF 可完整解码，保留帧顺序、时长、尺寸和循环',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dc-gif-'));
 try{
 const frames=[0,1,2].map(n=>({width:40,height:30,data:Uint8Array.from({length:40*30*4},(_,i)=>i%4===3?255:i%4===n?255:0)}));
 const bytes=encodeGIF(frames,40,30,200),path=join(dir,'test.gif');writeFileSync(path,bytes);
 assert.ok(Buffer.from(bytes).includes(Buffer.from('NETSCAPE2.0')));
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,nb_read_frames,duration','-of','json',path])).streams[0];
 assert.equal(info.nb_read_frames,'3');assert.equal(Number(info.duration),0.6);assert.equal(info.width,40);
 const raw=execFileSync('ffmpeg',['-v','error','-i',path,'-f','rawvideo','-pix_fmt','rgba','-']);
 for(let n=0;n<3;n++)assert.equal(raw[n*40*30*4+n],255);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('拒绝过大的统一 GIF 画布',()=>assert.throws(()=>encodeGIF([{width:1,height:1,data:new Uint8Array(4)}],5000,10),/过大/));
test('自适应 GIF 对不超过255色的非网格 RGB 精确保色',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dc-colors-'));try{
 const data=Uint8Array.from([122,43,97,255,19,176,88,255]);const path=join(dir,'colors.gif');writeFileSync(path,encodeGIF([{width:2,height:1,data}],2,1));const raw=execFileSync('ffmpeg',['-v','error','-i',path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-']);assert.deepEqual(new Uint8Array(raw),data);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('GIF 默认无限，单次省略循环扩展，有限次数编码为总次数减一',()=>{
 const frame={width:1,height:1,data:new Uint8Array([255,0,0,255])},marker=Buffer.from('NETSCAPE2.0');
 for(const [loops,expected] of [[0,0],[1,null],[2,1],[10,9],[65536,65535]]){const b=Buffer.from(encodeGIF([frame],1,1,200,loops)),i=b.indexOf(marker);if(expected===null)assert.equal(i,-1);else{assert.ok(i>=0);assert.equal(b.readUInt16LE(i+13),expected);}}
 assert.throws(()=>encodeGIF([frame],1,1,200,-1),/循环次数/);assert.throws(()=>encodeGIF([frame],1,1,200,1.5),/循环次数/);
});
