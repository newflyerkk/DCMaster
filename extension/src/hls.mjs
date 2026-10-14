export function resourceURL(value,base) {
 const url=new URL(value,base);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('视频资源必须使用 HTTPS。');
 return url.href;
}
export function manifestIdentity(value,base='https://www.figma.com/') {
 try {const u=new URL(value,base);if(!['figma.com','www.figma.com'].includes(u.hostname)||u.protocol!=='https:')return null;
 const m=u.pathname.match(/^\/api\/files\/([^/]+)\/videos\/([\w-]+)\/manifest\/?$/);
 return m?{key:m[1]+'/'+m[2],file:m[1],hash:m[2],url:u.href}:null;
 }catch{return null;}
}
function attrs(line) {
 const out={};const pattern=/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;let m;
 while((m=pattern.exec(line.slice(line.indexOf(':')+1))))out[m[1]]=m[2].replace(/^"|"$/g,'');return out;
}
export function parsePlaylist(text,base) {
 if(text.length>1024*1024||!text.trimStart().startsWith('#EXTM3U'))throw Error('返回内容不是有效 HLS 播放列表。');
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const variants=[],segments=[],audio=[];let pending=null,init=null,range=null,previous=null,duration=0;
 for(const line of lines){
  if(line.startsWith('#EXT-X-KEY:')&&attrs(line).METHOD!=='NONE')throw Error('暂不支持加密视频流。');
  if(line.startsWith('#EXT-X-DISCONTINUITY')&&!line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE'))throw Error('暂不支持时间线不连续的视频流。');
  if(line.startsWith('#EXT-X-MEDIA:')){const a=attrs(line);if(a.TYPE==='AUDIO'&&a.URI)audio.push(a);}
  else if(line.startsWith('#EXT-X-STREAM-INF:'))pending=attrs(line);
  else if(line.startsWith('#EXTINF:'))duration+=parseFloat(line.slice(8))||0;
  else if(line.startsWith('#EXT-X-MAP:')){
   const a=attrs(line);if(!a.URI)throw Error('缺少视频初始化片段。');
   const next={url:resourceURL(a.URI,base),range:parseRange(a.BYTERANGE,null)};
   if(init&&JSON.stringify(init)!==JSON.stringify(next))throw Error('暂不支持视频中途更换编码配置。');init=next;
  } else if(line.startsWith('#EXT-X-BYTERANGE:'))range=line.slice(17);
  else if(!line.startsWith('#')){
   const url=resourceURL(line,base);
   if(pending){variants.push({url,bandwidth:Number(pending.BANDWIDTH)||0,resolution:pending.RESOLUTION||'',audio:pending.AUDIO,codecs:pending.CODECS||''});pending=null;}
   else {const r=parseRange(range,previous?.url===url?previous.range:null);const item={url,range:r};segments.push(item);previous=item;range=null;}
  }
 }
 if(pending)throw Error('播放列表缺少清晰度地址。');
 if(!variants.length&&(!segments.length||!lines.includes('#EXT-X-ENDLIST')))throw Error('仅支持完整点播视频，请等待视频加载；直播/未完成列表暂不支持。');
 return {variants,segments,audio,init,duration};
}
function parseRange(value,previous){
 if(!value)return null;
 if(!/^\d+(?:@\d+)?$/.test(value))throw Error('无效视频字节范围。');
 const [length,start]=value.split('@').map(Number);const offset=start??(previous?previous.offset+previous.length:NaN);
 if(!Number.isSafeInteger(length)||length<1||!Number.isSafeInteger(offset)||offset<0)throw Error('无法解析视频字节范围。');
 return {length,offset};
}
export function chooseVariant(playlist,quality='best') {
 const sorted=[...playlist.variants].sort((a,b)=>b.bandwidth-a.bandwidth);
 const selected=quality==='small'?sorted.at(-1):sorted[0];
 if(selected&&playlist.audio.some(a=>a['GROUP-ID']===selected.audio))throw Error('此视频使用独立音轨，当前版本不支持合并；已停止以避免导出无声视频。');
 if(selected?.codecs&&selected.codecs.split(',').some(c=>! /^(avc1|avc3|mp4a)\./.test(c.trim())))throw Error('当前支持 H.264/AAC 视频，此编码暂不支持。');
 return selected;
}
