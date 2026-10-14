import {finalizeMP4} from './mp4.mjs';
import muxjs from 'mux.js';
import {parsePlaylist,chooseVariant} from './hls.mjs';
export async function downloadVideo(url,{fetcher=fetch,signal,onProgress=()=>{},quality='best',maxBytes=256*1024*1024}={}) {
 let loaded=0;
 async function get(resource,text=false){
  signal?.throwIfAborted();
  const response=await fetcher(resource.url,{credentials:'same-origin',signal,headers:resource.range?{Range:`bytes=${resource.range.offset}-${resource.range.offset+resource.range.length-1}`}:{}});
  if(!response.ok)throw Error(`下载失败（HTTP ${response.status}）。请刷新 Figma 页面并重新播放视频。`);
  if(resource.range&&response.status!==206)throw Error('服务器未按字节范围返回视频，已停止以避免文件损坏。');
  const limit=text?1024*1024:maxBytes-loaded;
  if(Number(response.headers.get('content-length'))>limit)throw Error('视频超过 256 MB 或播放列表过大，请使用较低清晰度。');
  const reader=response.body?.getReader();if(!reader)throw Error('无法读取视频响应。');
  let size=0;const chunks=[];
  try{while(true){signal?.throwIfAborted();const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit)throw Error('视频超过 256 MB，请使用较低清晰度。');chunks.push(r.value);}}catch(e){await reader.cancel();throw e;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(resource.range&&size!==resource.range.length)throw Error('视频片段长度不匹配。');
  if(text)return new TextDecoder().decode(bytes);loaded+=size;return bytes;
 }
 let mediaURL=url,playlist;const seen=new Set();let label='原清晰度';
 for(let depth=0;depth<5;depth++){
  if(seen.has(mediaURL))throw Error('播放列表循环引用。');seen.add(mediaURL);
  onProgress('读取视频清晰度…');playlist=parsePlaylist(await get({url:mediaURL},true),mediaURL);
  if(!playlist.variants.length)break;
  const v=chooseVariant(playlist,quality);label=v.resolution||'自动清晰度';mediaURL=v.url;playlist=null;
 }
 if(!playlist)throw Error('播放列表嵌套过深。');
 const parts=[];let initWritten=false,transmuxer,error,mediaSegments=0;
 if(playlist.init){const init=await get(playlist.init);const type=new TextDecoder().decode(init.subarray(4,8));if(type!=='ftyp')throw Error('视频初始化片段不是 MP4。');parts.push(init);}
 else {
  transmuxer=new muxjs.mp4.Transmuxer({remux:true,keepOriginalTimestamps:false});
  transmuxer.on('error',e=>{error=Error(String(e));});
  transmuxer.on('data',segment=>{if(segment.type!=='combined'&&segment.type!=='video'){error=Error('未发现兼容视频轨道，已停止导出。');return;}if(!initWritten){parts.push(segment.initSegment);initWritten=true;}parts.push(segment.data);mediaSegments++;});
 }
 try{
  for(let i=0;i<playlist.segments.length;i++){
   onProgress(`下载片段 ${i+1}/${playlist.segments.length} · ${(loaded/1048576).toFixed(1)} MB`);
   const data=await get(playlist.segments[i]);
   if(transmuxer){if(data[0]!==0x47)throw Error('此媒体片段不是支持的 MPEG-TS。');transmuxer.push(data);transmuxer.flush();if(error)throw error;}
   else {if(data.length<8||!['styp','moof','sidx','emsg','prft'].includes(new TextDecoder().decode(data.subarray(4,8))))throw Error('视频媒体片段格式不受支持。');parts.push(data);mediaSegments++;}
  }
  if(!mediaSegments)throw Error('没有生成有效视频内容。');signal?.throwIfAborted();
  const blob=new Blob(parts,{type:'video/mp4'});if(blob.size>maxBytes)throw Error('输出超过 256 MB。');onProgress('重建 MP4 索引、修正时间戳与时长…');const finalized=await finalizeMP4(blob,{signal,expectedDuration:playlist.duration,maxBytes});return {...finalized,label};
 }finally{transmuxer?.dispose();}
}
