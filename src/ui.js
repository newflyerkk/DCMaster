import {collectDroppedFiles,isImportImage} from './import-files.mjs';
import {zipSync} from 'fflate';
import {parseScales,outputPath} from './core.mjs';
const $=id=>document.getElementById(id);
for(const [id,values,selected] of [['formats',['png','jpeg','svg','pdf','webp','gif'],['png']],['scales',[1,1.5,2,3,4],[1]]]) for(const v of values){const label=document.createElement('label');label.className='chip';const input=document.createElement('input');input.type='checkbox';input.value=v;input.checked=selected.includes(v);const span=document.createElement('span');span.textContent=id==='formats'?String(v).toUpperCase():v+'x';label.append(input,span);$(id).append(label);}
let worker,results=[],settings,busy=false,used=new Set(),run=0,selectionKey='',stale=false;
const send=message=>parent.postMessage({pluginMessage:message},'*');
let importing=false;
$('open-import').onclick=()=>{if(busy)return;$('import-page').showModal();};
$('back-home').onclick=()=>{$('import-page').close();};
$('import-page').addEventListener('click',e=>{if(e.target===$('import-page')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
let previewURLs=[];
function clearPreviews(){for(const url of previewURLs)URL.revokeObjectURL(url);previewURLs=[];}
function addPreview(item,r){
 const mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',pdf:'application/pdf',mp4:'video/mp4'}[r.format];
 const url=URL.createObjectURL(new Blob([r.bytes],{type:mime}));previewURLs.push(url);
 const media=document.createElement(r.format==='mp4'?'video':r.format==='pdf'?'iframe':'img');media.className='preview-media';
 if(r.format==='mp4'){media.controls=true;media.loop=true;media.muted=true;}else if(r.format==='pdf'){media.title=r.path+' 输出预览';}else{media.alt=r.path+' 输出效果';media.loading='lazy';}
 media.src=url;item.prepend(media);
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent='打开完整预览';item.append(link);
}

function importMessage(text,error=false){$('import-status').textContent=text;$('import-status').className=error?'error':'small';}
function finishImport(){importing=false;$('import-button').disabled=busy;$('import-folder-button').disabled=busy;$('preview').disabled=busy;$('import-create-frames').disabled=false;}
$('import-button').onclick=()=>{if(!busy&&!importing)$('import-files').click();};
function lockImport(){importing=true;$('import-create-frames').disabled=true;$('import-button').disabled=true;$('import-folder-button').disabled=true;$('preview').disabled=true;}
async function importFiles(files){
 try{
  files=files.filter(isImportImage);
  if(!files.length)throw Error('未找到 PNG、JPG 或 WebP 图片。');
  if(files.reduce((sum,f)=>sum+f.size,0)>128*1024*1024)throw Error('本批图片超过 128 MB，请分批导入。');
  const images=[];
  for(const file of files){importMessage(`正在读取 ${images.length+1} / ${files.length}：${file.name}`);images.push({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});}
  importMessage('正在导入原尺寸图片…');send({type:'import-images',files:images,createFrames:$('import-create-frames').checked});
 }catch(e){finishImport();importMessage(e.message,true);}
}
for(const id of ['import-files','import-folder'])$(id).onchange=()=>{
 const files=[...$(id).files];$(id).value='';
 if(!files.length||busy||importing)return;
 lockImport();void importFiles(files);
};
$('import-folder-button').onclick=()=>{if(!busy&&!importing)$('import-folder').click();};
const dropZone=$('import-drop');
window.addEventListener('dragover',e=>{e.preventDefault();if(!busy&&!importing){e.dataTransfer.dropEffect='copy';if(!$('import-page').open)$('import-page').showModal();dropZone.classList.add('drag-over');}});
window.addEventListener('dragleave',e=>{if(!e.relatedTarget)dropZone.classList.remove('drag-over');});
window.addEventListener('drop',async e=>{
 e.preventDefault();dropZone.classList.remove('drag-over');
 if(busy||importing)return;
 // Capture entries synchronously while the drag data store is accessible.
 const items=[...(e.dataTransfer?.items||[])].filter(i=>i.kind==='file');
 const entries=[],fallback=[];
 for(const item of items){const entry=item.webkitGetAsEntry?.();if(entry)entries.push(entry);else{const file=item.getAsFile();if(file)fallback.push(file);}}
 if(!items.length)fallback.push(...(e.dataTransfer?.files||[]));
 lockImport();importMessage('正在读取文件夹及子文件夹…');
 try{await importFiles(await collectDroppedFiles(entries,fallback));}
 catch(error){finishImport();importMessage('读取文件夹失败：'+error.message,true);}
});
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
function message(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function invalidate(){stale=true;$('download').disabled=true;if(!busy){results=[];clearPreviews();$('summary').replaceChildren();$('results').replaceChildren();message('设置或设计已更新，请重新计算预览。');}}
function updateOptions(){
 const formats=[...$('formats').querySelectorAll('input:checked')].map(i=>i.value);
 const preset=document.querySelector('input[name="preset"]:checked').value;
 $('preset-description').textContent={lossless:'保留像素，自动优化文件大小。',quality:'画质优先，适合细节丰富的设计。',balanced:'兼顾画质与文件大小，适合日常交付。',size:'更积极地减小文件，可能出现可见画质损失。'}[preset];
 const notes=[];
 if(formats.includes('png')) notes.push(preset==='lossless'?'PNG 保持像素完全一致':'PNG 启用减色及透明度量化，档位越低允许的误差越大');
 if(formats.some(f=>['svg','pdf'].includes(f))) notes.push('SVG / PDF 各档均保留矢量，采用保守优化');
 if(formats.includes('jpeg')) notes.push(preset==='lossless'?'JPEG 仍有首次编码损失，使用最高质量':'JPEG 使用有损编码');
 $('format-note').textContent=notes.join('；')+(notes.length?'。':'');
 if(formats.includes('mp4')) notes.push('MP4 导出整个动态顶层 Frame；无损/高清均使用视频高质量，不保证无损；最高 4K');
 $('format-note').textContent=notes.join('；')+(notes.length?'。':'');
 $('gif-options').hidden=!formats.includes('gif');
 $('jpeg-options').hidden=!formats.includes('jpeg');
 const raster=formats.some(f=>['png','jpeg','webp'].includes(f));
 $('deep-option').hidden=!raster;$('special').hidden=!raster&&!formats.includes('mp4');
}
$('settings').addEventListener('input',()=>{updateOptions();invalidate();});
updateOptions();
function finish(){busy=false;$('import-button').disabled=importing;$('import-folder-button').disabled=importing;$('settings').disabled=false;for(const e of $('settings').elements)e.disabled=false;$('preview').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;}
function stop(){run++;worker?.terminate();worker=null;send({type:'cancel'});finish();results=[];$('download').disabled=true;}
$('cancel').onclick=()=>{stop();message('已取消，未完成的结果已清除。');};
$('preview').onclick=()=>{
 if(importing)return;
 try{const formats=[...$('formats').querySelectorAll('input:checked')].map(i=>i.value);if(!formats.length)throw Error('请至少选择一种格式。');const gifDelay=Number($('gif-delay').value);if(formats.includes('gif')&&(!Number.isFinite(gifDelay)||gifDelay<20||gifDelay>10000))throw Error('GIF 每帧时长须为 20–10000 毫秒。');settings={formats,gifDelay,scales:parseScales([...$('scales').querySelectorAll('input:checked')].map(i=>i.value),$('custom').value),mode:document.querySelector('input[name="preset"]:checked').value,effort:$('deep').checked?'deep':'balanced',named:$('named').checked,background:$('background').value.slice(1)};
 clearPreviews();results=[];used=new Set();stale=false;busy=true;$('import-button').disabled=true;$('import-folder-button').disabled=true;run++;$('results').replaceChildren();$('summary').replaceChildren();$('download').disabled=true;$('preview').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;for(const e of $('settings').elements)e.disabled=true;
 worker?.terminate();const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
 worker.onerror=e=>{stop();message('压缩引擎运行失败：'+e.message,true);};
 const thisRun=run;worker.onmessage=({data})=>{if(run!==thisRun||!busy)return;if(data.error){stop();message(data.error,true);return;}const r=data.result;r.path=outputPath(r,settings.named,used);results.push(r);if(results.reduce((s,r)=>s+r.size,0)>256*1024*1024){stop();message('结果超过 256 MB，请减少对象或倍率后分批导出。',true);return;}const item=document.createElement('div');item.className='item';const path=document.createElement('div');path.className='path';path.textContent=r.path;const detail=document.createElement('div');detail.className='small';const pct=(1-r.size/r.originalSize)*100;detail.textContent=r.format==='mp4'?`${size(r.size)} · ${r.note}`:`${size(r.originalSize)} → ${size(r.size)} · ${pct>=0?'节省':'增加'} ${Math.abs(pct).toFixed(1)}% · ${r.note}`;item.append(path,detail);addPreview(item,r);$('results').append(item);$('progress').max=r.total;$('progress').value=results.length;message(`已处理 ${results.length} / ${r.total}`);send({type:'ack'});};message('正在导出并试压，首次加载编码器可能稍慢…');send({type:'prepare',...settings});
 }catch(e){message(e.message,true);}
};
window.onmessage=({data})=>{const m=data.pluginMessage;if(!m)return;if(m.type==='import-progress'){importMessage(m.message);return;}if(m.type==='import-result'){finishImport();importMessage(m.error?`导入失败：${m.error}`:`已导入 ${m.count} 张图片，已选中新建的${m.createFrames===false?'图片':' Frame'}。`,!!m.error);return;}if(m.type==='selection'){const key=JSON.stringify(m.nodes);$('selection').textContent=m.nodes.length?`已选择 ${m.nodes.length} 个对象 · ${m.nodes.slice(0,3).map(n=>n.name).join('、')}`:'请在画布中选择要导出的对象';if(selectionKey&&key!==selectionKey)invalidate();selectionKey=key;}
 if(m.type==='progress'&&busy)message(m.message);
 if(m.type==='invalidate')invalidate();
 if(m.type==='asset'&&busy)worker.postMessage({id:run,asset:m,settings});
 if(m.type==='error'){stop();message(m.message,true);}
 if(m.type==='done'&&busy){finish();worker?.terminate();worker=null;if(m.cancelled){results=[];message('已取消。');return;}const compressed=results.filter(r=>r.format!=='mp4');const before=compressed.reduce((s,r)=>s+r.originalSize,0),after=compressed.reduce((s,r)=>s+r.size,0);const totalBytes=results.reduce((s,r)=>s+r.size,0);$('summary').textContent=`${results.length} 个文件 · 总计 ${size(totalBytes)} · 图片/文档 ${size(before)} → ${size(after)} · ${after<=before?'节省':'增加'} ${before?Math.abs((1-after/before)*100).toFixed(1):0}%`;if(!compressed.length)$('summary').textContent=`${results.length} 个视频 · ${size(totalBytes)} · 原生编码，无二次压缩`;$('summary').className='stats';$('download').disabled=stale||!results.length;message(stale?'选区已变化，请重新预览。':'试压完成，以上为实际文件大小。');}}
$('download').onclick=()=>{try{const files={};for(const r of results)files[r.path]=[r.bytes,{level:r.format==='svg'?6:0}];const blob=new Blob([zipSync(files)],{type:'application/zip'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='DCMaster-gpt.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){message('打包失败：'+e.message,true);}};
send({type:'ready'});
