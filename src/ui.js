import {collectDroppedFiles,collectHandles,isImportImage,isArchive,isImportable} from './import-files.mjs';
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
function clearPreviews(){if(zoomDialog.open)zoomDialog.close();for(const url of previewURLs)URL.revokeObjectURL(url);previewURLs=[];}
const zoomDialog=document.createElement('dialog');zoomDialog.id='zoom-preview';zoomDialog.setAttribute('aria-label','压缩前后放大对比');
zoomDialog.innerHTML='<div class="modal-header"><h2>效果对比</h2><button type="button" aria-label="关闭放大预览">✕</button></div><label class="zoom-control">缩放 <select aria-label="图片缩放"><option value="fit">自适应窗口</option><option value="1">100%</option></select></label><div class="zoom-content"></div>';
document.body.append(zoomDialog);zoomDialog.querySelector('button').onclick=()=>zoomDialog.close();
zoomDialog.addEventListener('close',()=>zoomDialog.querySelector('.zoom-content').replaceChildren());
zoomDialog.querySelector('select').onchange=e=>{const area=zoomDialog.querySelector('.zoom-content');area.classList.toggle('actual-size',e.target.value!=='fit');for(const image of area.querySelectorAll('img')){image.style.width=e.target.value==='fit'?'':image.naturalWidth*Number(e.target.value)+'px';image.style.maxWidth=e.target.value==='fit'?'':'none';}};
function previewURL(bytes,format){const url=URL.createObjectURL(new Blob([bytes],{type:{png:'image/png',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',pdf:'application/pdf',mp4:'video/mp4'}[format]}));previewURLs.push(url);return url;}
function comparison(sources,format,name,large=false){
 const grid=document.createElement('div');grid.className='comparison';
 for(const [label,url,f] of sources){const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=label;
 const media=document.createElement(f==='pdf'?'iframe':f==='mp4'?'video':'img');media.className='preview-media';media.src=url;
 if(f==='pdf')media.title=name+' '+label;else if(f==='mp4')media.controls=true;else media.alt=name+' '+label;
 if(!large&&f!=='pdf'&&f!=='mp4'){const button=document.createElement('button');button.type='button';button.className='preview-open';button.setAttribute('aria-label','放大查看 '+name+' '+label);button.append(media);button.onclick=()=>{zoomDialog.querySelector('h2').textContent=name;zoomDialog.querySelector('select').value='fit';const area=zoomDialog.querySelector('.zoom-content');area.classList.remove('actual-size');area.replaceChildren(comparison(sources,format,name,true));zoomDialog.showModal();};figure.append(caption,button);}else figure.append(caption,media);
 grid.append(figure);}
 return grid;
}
function addPreview(item,r){
 const after=previewURL(r.bytes,r.format);
 const before=r.beforeBytes?previewURL(r.beforeBytes,r.beforeFormat):after;
 if(r.beforeFrames){
  for(let i=0;i<r.beforeFrames.length;i++){const title=document.createElement('div');title.className='small';title.textContent=`源帧 ${i+1} / ${r.beforeFrames.length} → GIF 动画`;item.append(title,comparison([['转换前 · 源帧',previewURL(r.beforeFrames[i],'png'),'png'],['转换后 · 动画',after,'gif']],r.format,r.path));}
 }else item.prepend(comparison([['压缩前',before,r.beforeFormat||r.format],['压缩后',after,r.format]],r.format,r.path));
}

let preferencesReady=false;
function preferenceInputs(){return [...document.querySelectorAll('#settings input,#settings select,#import-create-frames')];}
function preferenceKey(e){return e.id||`${e.name}:${e.value}`;}
function savePreferences(){if(!preferencesReady)return;const value={};for(const e of preferenceInputs())value[preferenceKey(e)]=['checkbox','radio'].includes(e.type)?e.checked:e.value;send({type:'save-preferences',value});}
document.addEventListener('input',savePreferences);document.addEventListener('change',savePreferences);
function restorePreferences(value){
 if(value&&typeof value==='object')for(const e of preferenceInputs()){const v=value[preferenceKey(e)];if(['checkbox','radio'].includes(e.type)){if(typeof v==='boolean')e.checked=v;}else if(typeof v==='string')e.value=v;}
 if(!document.querySelector('input[name="preset"]:checked'))document.querySelector('input[value="lossless"]').checked=true;
 preferencesReady=true;for(const e of preferenceInputs())e.disabled=false;$('preview').disabled=false;$('open-import').disabled=false;updateOptions();
}
function importMessage(text,error=false){$('import-status').textContent=text;$('import-status').className=error?'error':'small';}
function finishImport(){importing=false;$('import-button').disabled=busy;$('import-folder-button').disabled=busy;$('preview').disabled=busy;$('import-create-frames').disabled=false;}
$('import-button').onclick=()=>{if(!busy&&!importing)$('import-files').click();};
function lockImport(){importing=true;$('import-create-frames').disabled=true;$('import-button').disabled=true;$('import-folder-button').disabled=true;$('preview').disabled=true;}
function unpackFile(bytes){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([ARCHIVE_SOURCE],{type:'application/javascript'}));const worker=new Worker(url);URL.revokeObjectURL(url);const timer=setTimeout(()=>{worker.terminate();reject(Error('解压超时，请拆分压缩包。'));},120000);const finish=()=>{clearTimeout(timer);worker.terminate();};worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.files);};worker.onerror=()=>{finish();reject(Error('解压引擎运行失败。'));};worker.postMessage({bytes});});}
async function importFiles(files){
 try{
  files=files.filter(isImportable);
  if(!files.length)throw Error('未找到支持的图片或 ZIP / RAR / 7z 压缩包。');
  if(files.reduce((sum,f)=>sum+f.size,0)>128*1024*1024)throw Error('本批图片超过 128 MB，请分批导入。');
  const images=[];
  for(const file of files){importMessage(`正在读取 ${images.length+1} / ${files.length}：${file.name}`);const bytes=new Uint8Array(await file.arrayBuffer());if(isArchive(file)){importMessage('正在解压：'+file.name);images.push(...await unpackFile(bytes));}else images.push({name:file.name,bytes});if(images.reduce((n,f)=>n+f.bytes.length,0)>128*1024*1024)throw Error('解压后图片超过 128 MB，请分批导入。');}
  if(!images.length)throw Error('压缩包内没有支持的图片。');importMessage('正在导入原尺寸图片…');send({type:'import-images',files:images,createFrames:$('import-create-frames').checked});
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
 const handlePromises=items.map(i=>{try{return i.getAsFileSystemHandle?.()||Promise.resolve(null);}catch{return Promise.resolve(null);}});
 const entries=[],fallback=[...(e.dataTransfer?.files||[])].filter(isImportable);
 for(const item of items){try{const entry=item.webkitGetAsEntry?.();if(entry)entries.push(entry);}catch{}}
 if(!items.length)fallback.push(...(e.dataTransfer?.files||[]));
 lockImport();importMessage('正在读取文件夹及子文件夹…');
 try{let files;const handles=await Promise.all(handlePromises.map(p=>Promise.resolve(p).catch(()=>null)));try{files=handles.length&&handles.every(Boolean)?await collectHandles(handles):await collectDroppedFiles(entries,[]);}catch(error){if(fallback.length)files=fallback;else throw error;}if(!files.length)files=fallback;await importFiles(files);}
 catch(error){finishImport();importMessage('当前 Figma 无法读取拖入的文件夹，请点击“选择文件夹”导入，或将文件夹压成 ZIP / RAR / 7z 后拖入。',true);}
});
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
function message(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function invalidate(){stale=true;$('download').disabled=true;if(!busy){results=[];clearPreviews();$('summary').replaceChildren();$('results').replaceChildren();message('设置或设计已更新，请重新计算预览。');}}
function updateOptions(){
 const formats=[...$('formats').querySelectorAll('input:checked')].map(i=>i.value);
 const preset=document.querySelector('input[name="preset"]:checked').value;
 $('preset-description').textContent={none:'Figma 原生格式直接导出，不做压缩。',lossless:'保留像素，自动优化文件大小。',quality:'画质优先，适合细节丰富的设计。',balanced:'兼顾画质与文件大小，适合日常交付。',size:'更积极地减小文件，可能出现可见画质损失。'}[preset];
 const notes=[];
 if(formats.includes('png')) notes.push(preset==='lossless'?'PNG 保持像素完全一致':'PNG 启用减色及透明度量化，档位越低允许的误差越大');
 if(formats.some(f=>['svg','pdf'].includes(f))) notes.push('SVG / PDF 各档均保留矢量，采用保守优化');
 if(formats.includes('jpeg')) notes.push(preset==='lossless'?'JPEG 仍有首次编码损失，使用最高质量':'JPEG 使用有损编码');
 $('format-note').textContent=notes.join('；')+(notes.length?'。':'');
 if(formats.includes('mp4')) notes.push('MP4 导出整个动态顶层 Frame；无损/高清均使用视频高质量，不保证无损；最高 4K');
 $('format-note').textContent=notes.join('；')+(notes.length?'。':'');
 const requestedDelay=Number($('gif-delay').value),delay=Math.max(20,Math.round(requestedDelay/10)*10);$('gif-rate').textContent=delay>0?`每帧 ${delay} 毫秒 · 每秒约 ${Number((1000/delay).toFixed(2))} 帧`:'';$('gif-options').hidden=!formats.includes('gif');document.querySelector('input[value="lossless"]').nextElementSibling.textContent=formats.includes('gif')?'保色优先':'无损';$('format-note').hidden=!(formats.includes('gif')||preset==='none');
 $('jpeg-options').hidden=!formats.includes('jpeg');
 if(formats.includes('gif'))$('format-note').textContent='GIF 使用自适应调色板，超过 255 色仍需量化，不能保证无损。';else if(preset==='none')$('format-note').textContent='PNG / JPEG 直接使用 Figma 原生导出；SVG / PDF 仅调整倍率。WebP / GIF 为格式转换，无法与原生输出逐字节对齐。';
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
 try{const formats=[...$('formats').querySelectorAll('input:checked')].map(i=>i.value);if(!formats.length)throw Error('请至少选择一种格式。');const gifDelay=Number($('gif-delay').value);if(formats.includes('gif')&&(!Number.isFinite(gifDelay)||gifDelay<20||gifDelay>10000))throw Error('GIF 每帧时长须为 20–10000 毫秒。');settings={formats,gifDelay,scales:parseScales([...$('scales').querySelectorAll('input:checked')].map(i=>i.value),$('custom').value),mode:document.querySelector('input[name="preset"]:checked').value,effort:$('deep').checked?'deep':'balanced',named:$('named').checked,scaleSuffix:$('scale-suffix').checked,background:$('background').value.slice(1)};
 clearPreviews();results=[];used=new Set();stale=false;busy=true;$('import-button').disabled=true;$('import-folder-button').disabled=true;run++;$('results').replaceChildren();$('summary').replaceChildren();$('download').disabled=true;$('preview').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;for(const e of $('settings').elements)e.disabled=true;
 worker?.terminate();const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'application/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
 worker.onerror=e=>{stop();message('压缩引擎运行失败：'+e.message,true);};
 const thisRun=run;worker.onmessage=({data})=>{if(run!==thisRun||!busy)return;if(data.error){stop();message(data.error,true);return;}const r=data.result;r.path=outputPath(r,settings.named,used,settings.scaleSuffix);results.push(r);if(results.reduce((s,r)=>s+r.size+(r.beforeBytes?.length||0)+(r.beforeFrames?.reduce((n,b)=>n+b.length,0)||0),0)>256*1024*1024){stop();message('结果超过 256 MB，请减少对象或倍率后分批导出。',true);return;}const item=document.createElement('div');item.className='item';const path=document.createElement('div');path.className='path';path.textContent=r.path;const detail=document.createElement('div');detail.className='small';const pct=(1-r.size/r.originalSize)*100;detail.textContent=r.format==='mp4'?`${size(r.size)} · ${r.note}`:`${size(r.originalSize)} → ${size(r.size)} · ${pct>=0?'节省':'增加'} ${Math.abs(pct).toFixed(1)}% · ${r.note}`;const saving=detail.textContent.match(/节省 ([0-9.]+)%/);if(saving){const text=detail.textContent;const position=text.indexOf(saving[0]);const highlight=document.createElement('strong');highlight.className='saving-percent';highlight.textContent=saving[1]+'%';detail.replaceChildren(document.createTextNode(text.slice(0,position)+'节省 '),highlight,document.createTextNode(text.slice(position+saving[0].length)));}item.append(path,detail);addPreview(item,r);$('results').append(item);$('progress').max=r.total;$('progress').value=results.length;message(`已处理 ${results.length} / ${r.total}`);send({type:'ack'});};message('正在导出并试压，首次加载编码器可能稍慢…');send({type:'prepare',...settings});
 }catch(e){message(e.message,true);}
};
window.onmessage=({data})=>{const m=data.pluginMessage;if(!m)return;if(m.type==='preferences'){restorePreferences(m.value);return;}if(m.type==='import-progress'){importMessage(m.message);return;}if(m.type==='import-result'){finishImport();importMessage(m.error?`导入失败：${m.error}`:`已导入 ${m.count} 张图片，已选中新建的${m.createFrames===false?'图片':' Frame'}。`,!!m.error);return;}if(m.type==='selection'){const key=JSON.stringify(m.nodes);$('selection').textContent=m.nodes.length?`已选择 ${m.nodes.length} 个对象 · ${m.nodes.slice(0,3).map(n=>n.name).join('、')}`:'请在画布中选择要导出的对象';if(selectionKey&&key!==selectionKey)invalidate();selectionKey=key;}
 if(m.type==='progress'&&busy)message(m.message);
 if(m.type==='invalidate')invalidate();
 if(m.type==='asset'&&busy)worker.postMessage({id:run,asset:m,settings});
 if(m.type==='error'){stop();message(m.message,true);}
 if(m.type==='done'&&busy){finish();worker?.terminate();worker=null;if(m.cancelled){results=[];message('已取消。');return;}const compressed=results.filter(r=>r.format!=='mp4');const before=compressed.reduce((s,r)=>s+r.originalSize,0),after=compressed.reduce((s,r)=>s+r.size,0);const totalBytes=results.reduce((s,r)=>s+r.size,0);$('summary').textContent=`${results.length} 个文件 · 总计 ${size(totalBytes)} · 图片/文档 ${size(before)} → ${size(after)} · ${after<=before?'节省':'增加'} ${before?Math.abs((1-after/before)*100).toFixed(1):0}%`;if(!compressed.length)$('summary').textContent=`${results.length} 个视频 · ${size(totalBytes)} · 原生编码，无二次压缩`;$('summary').className='stats';$('download').disabled=stale||!results.length;message(stale?'选区已变化，请重新预览。':'试压完成，以上为实际文件大小。');}}
$('download').onclick=()=>{try{const files={};for(const r of results)files[r.path]=[r.bytes,{level:r.format==='svg'?6:0}];const blob=new Blob([zipSync(files)],{type:'application/zip'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='DC Master.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){message('打包失败：'+e.message,true);}};
for(const e of preferenceInputs())e.disabled=true;$('preview').disabled=true;$('open-import').disabled=true;send({type:'ready'});
