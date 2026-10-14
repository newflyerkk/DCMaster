import {manifestIdentity} from './hls.mjs';
import {downloadVideo} from './download.mjs';
// No cookies are read or copied. Fetch uses the current page's same-origin session.
const records=new Map();const originalFetch=window.fetch.bind(window);let panel,select,status,download,cancel,quality,save,controller,readyURL,navigation=location.pathname,after=0;
function currentFile(){return location.pathname.match(/^\/(?:design|file|proto|slides|board|buzz)\/([^/]+)/)?.[1];}
function remember(value){
 const item=manifestIdentity(value,location.href);if(!item)return;
 const file=currentFile();if(file&&item.file!==file)return;
 if(records.has(item.key)){records.set(item.key,item);return;}
 records.set(item.key,item);if(records.size>50)records.delete(records.keys().next().value);render();
}
window.fetch=function(input,...args){try{remember(typeof input==='string'||input instanceof URL?String(input):input.url);}catch{}return originalFetch(input,...args);};
const nativeOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url,...args){try{remember(String(url));}catch{}return nativeOpen.call(this,method,url,...args);};
function render(){if(!select)return;const previous=select.value;select.replaceChildren();let index=0;for(const [key,item] of records){const option=document.createElement('option');option.value=key;option.textContent=`视频 ${++index} · ${item.hash.slice(0,12)}`;select.append(option);}if(records.has(previous))select.value=previous;download.disabled=!!controller||!records.size;if(!records.size){const option=document.createElement('option');option.textContent='尚未检测到视频';select.append(option);}}
function setStatus(value){if(status)status.textContent=value;}
function release(){if(readyURL)URL.revokeObjectURL(readyURL);readyURL=null;if(save){save.hidden=true;save.removeAttribute('href');}}
function mount(){
 if(panel||!document.body)return;
 panel=document.createElement('div');panel.id='dcmaster-video-companion';const root=panel.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=`:host{position:fixed;right:20px;bottom:20px;z-index:2147483647;color:#252334;font:12px/1.6 -apple-system,BlinkMacSystemFont,sans-serif}details{width:290px;background:#fff;border:1px solid #dedbe9;border-radius:12px;box-shadow:0 6px 30px #0002;padding:12px}summary{cursor:pointer;font-weight:650}p{color:#777080;margin:8px 0}select,button,a{font:inherit;border-radius:6px;padding:7px;box-sizing:border-box}select{width:100%;margin:4px 0;border:1px solid #ddd;background:#fff}button,a{border:0;background:#6d58df;color:white;cursor:pointer;text-decoration:none;display:inline-block}button:disabled{opacity:.4;cursor:default}#cancel{background:#eee;color:#333}#status{overflow-wrap:anywhere;margin:8px 0}[hidden]{display:none!important}`;
 root.append(style);const details=document.createElement('details');details.open=true;root.append(details);
 const summary=document.createElement('summary');summary.textContent='DCMaster-gpt · 视频填充 0.1.1';details.append(summary);
 const hint=document.createElement('p');hint.textContent='播放视频后，从检测列表选择并导出。列表按视频资源识别，不代表当前选中图层。';details.append(hint);
 select=document.createElement('select');select.setAttribute('aria-label','已检测视频');details.append(select);
 quality=document.createElement('select');quality.setAttribute('aria-label','视频清晰度');for(const [value,label] of [['best','最高可用清晰度'],['small','较小文件']]){const option=document.createElement('option');option.value=value;option.textContent=label;quality.append(option);}details.append(quality);
 download=document.createElement('button');download.textContent='提取为 MP4';download.id='download';details.append(download);
 cancel=document.createElement('button');cancel.id='cancel';cancel.textContent='取消';cancel.hidden=true;details.append(cancel);
 status=document.createElement('div');status.id='status';status.setAttribute('role','status');status.textContent='请先播放视频。若没有检测到，请刷新页面后重试。';details.append(status);
 save=document.createElement('a');save.textContent='保存 MP4';save.hidden=true;details.append(save);
 const foot=document.createElement('p');foot.textContent='本地封装，不重新编码。导出 Figma 播放版本，不保证是上传原文件。';details.append(foot);
 select.onchange=release;quality.onchange=release;
 cancel.onclick=()=>controller?.abort();
 download.onclick=async event=>{
  if(!event.isTrusted||controller)return;
  const item=records.get(select.value);if(!item)return;release();controller=new AbortController();const active=controller;download.disabled=true;select.disabled=true;quality.disabled=true;cancel.hidden=false;
  const timeout=setTimeout(()=>active.abort('下载超时，请重试。'),10*60*1000);
  try{
   const result=await downloadVideo(item.url,{fetcher:originalFetch,signal:active.signal,quality:quality.value,onProgress:setStatus});
   active.signal.throwIfAborted();readyURL=URL.createObjectURL(result.blob);save.href=readyURL;save.download=`DCMaster-video-${item.hash.slice(0,24)}.mp4`;save.hidden=false;
   setStatus(`已完成 · ${result.label} · ${result.duration.toFixed(1)} 秒 · ${(result.blob.size/1048576).toFixed(2)} MB。点击保存。`);
  }catch(error){setStatus(active.signal.aborted?'已取消或超时，未生成文件。':`无法提取：${error.message||String(error)}`);}
  finally{clearTimeout(timeout);controller=null;select.disabled=false;quality.disabled=false;cancel.hidden=true;render();}
 };
 document.body.append(panel);render();
}
new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.startTime>=after)remember(entry.name);}).observe({type:'resource',buffered:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
setInterval(()=>{if(navigation!==location.pathname){navigation=location.pathname;after=performance.now();records.clear();controller?.abort();release();render();setStatus('页面已切换，请播放需要导出的视频。');}},750);
window.addEventListener('pagehide',()=>{controller?.abort();release();});
