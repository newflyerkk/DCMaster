figma.showUI(__html__, { width: 420, height: 720, themeColors: true });
let busy = false;
let cancelled = false;
let ack: (() => void) | undefined;
function selection() {
  figma.ui.postMessage({ type: 'selection', nodes: figma.currentPage.selection.map(n => ({ id: n.id, name: n.name, width: n.width, height: n.height })) });
}
figma.on('selectionchange', selection);
function watchPage() { figma.currentPage.on('nodechange', () => figma.ui.postMessage({ type: 'invalidate' })); }
watchPage();
figma.on('currentpagechange', () => { watchPage(); selection(); });
figma.ui.onmessage = async msg => {
  if (msg.type === 'ready') { selection(); return; }
  if (msg.type === 'ack') { ack?.(); ack = undefined; return; }
  if (msg.type === 'cancel') { cancelled = true; ack?.(); ack = undefined; return; }
  if (msg.type === 'import-images') {
    if (busy) { figma.ui.postMessage({type:'import-result',error:'当前任务尚未完成，请稍后导入。'}); return; }
    busy = true;
    const frames: SceneNode[] = [];
    const createFrames = msg.createFrames !== false;
    try {
      if (!Array.isArray(msg.files) || !msg.files.length) throw new Error('请选择图片。');
      const page = figma.currentPage;
      const center = figma.viewport.center;
      const originX = Math.round(center.x), originY = Math.round(center.y);
      let x = originX, y = originY, rowHeight = 0;
      const rowWidth = Math.max(1200, figma.viewport.bounds.width);
      for (const file of msg.files) {
        if (figma.currentPage !== page) throw new Error('导入期间页面已切换，请在目标页面重新导入。');
        if (typeof file.name !== 'string' || !file.name || !(file.bytes instanceof Uint8Array) || !file.bytes.length) throw new Error('图片数据无效。');
        figma.ui.postMessage({type:'import-progress',message:`正在导入 ${frames.length + 1} / ${msg.files.length}：${file.name}`});
        const image = figma.createImage(file.bytes);
        const {width, height} = await image.getSizeAsync();
        if (figma.currentPage !== page) throw new Error('导入期间页面已切换，请重新导入。');
        if (x > originX && x + width > originX + rowWidth) { x = originX; y += rowHeight + 40; rowHeight = 0; }
        const name = file.name.replace(/\.(png|jpe?g|webp)$/i, '');
        let frame: FrameNode | undefined;
        if (createFrames) {
          frame = figma.createFrame();
          frames.push(frame);
          frame.name = name;
          frame.resize(width, height);
          frame.fills = [];
          frame.x = x; frame.y = y;
        }
        const rectangle = figma.createRectangle();
        if (frame) frame.appendChild(rectangle);
        else { frames.push(rectangle); page.appendChild(rectangle); }
        rectangle.name = name;
        rectangle.resize(width, height);
        rectangle.x = frame ? 0 : x; rectangle.y = frame ? 0 : y;
        rectangle.fills = [{type:'IMAGE',imageHash:image.hash,scaleMode:'FILL'}];
        x += width + 40; rowHeight = Math.max(rowHeight, height);
      }
      page.selection = frames;
      figma.viewport.scrollAndZoomIntoView(frames);
      figma.commitUndo();
      figma.ui.postMessage({type:'import-result',count:frames.length,createFrames});
    } catch (error) {
      for (const frame of frames) if (!frame.removed) frame.remove();
      figma.ui.postMessage({type:'import-result',error:error instanceof Error ? error.message : String(error)});
    } finally { busy = false; }
    return;
  }
  if (msg.type !== 'prepare') return;
  if (busy) { figma.ui.postMessage({type:'error',message:'上一次导出仍在收尾，请稍后重新预览。'}); return; }
  busy = true; cancelled = false;
  try {
    const nodes = [...figma.currentPage.selection];
    const scales = msg.scales as number[];
    const formats = msg.formats as string[];
    if (!nodes.length || !scales.length || !formats.length || scales.some(s => !Number.isFinite(s) || s <= 0 || s > 16) || formats.some(f => !['png','jpeg','webp','svg','pdf','mp4','gif'].includes(f))) throw new Error('请选择对象、格式及有效倍率（0–16x）。');
    const imageFormats = formats.filter(f => f !== 'mp4' && f !== 'gif');
    const videoFrames: FrameNode[] = [];
    if (formats.includes('mp4')) {
      for (const node of nodes) {
        const frame = node.type === 'FRAME' && node.parent?.type === 'PAGE' ? node : node.getTopLevelFrame();
        if (!frame) throw new Error(`${node.name} 没有所属顶层 Frame。请将视频放入页面顶层 Frame 后再导出 MP4。`);
        if (!videoFrames.some(f => f.id === frame.id)) videoFrames.push(frame);
      }
    }
    const total = (nodes.length * imageFormats.length + videoFrames.length + (formats.includes('gif') ? 1 : 0)) * scales.length;
    if (formats.includes('gif')) for (const scale of scales) {
      const frames: Uint8Array[] = [];
      let pixels = 0;
      for (const node of nodes) {
        if (cancelled) break;
        const width = Math.ceil(node.width * scale), height = Math.ceil(node.height * scale);
        pixels += width * height;
        if (Math.max(width,height) > 4096 || pixels > 32_000_000 || nodes.length > 200) throw new Error('GIF 最多 200 帧、累计 3200 万像素、最长边 4096；请减少对象或倍率。');
        frames.push(await node.exportAsync({format:'PNG',constraint:{type:'SCALE',value:scale},colorProfile:'SRGB'}));
      }
      if (cancelled) break;
      const receipt = new Promise<void>(resolve => { ack = resolve; });
      figma.ui.postMessage({type:'asset',format:'gif',frames,scale,index:0,name:nodes[0].name + '_动画',total,delay:msg.gifDelay});
      await receipt;
    }
    for (let index = 0; index < videoFrames.length; index++) {
      const frame = videoFrames[index];
      for (const scale of scales) {
        if (cancelled) break;
        const quality = msg.mode === 'size' ? 'LOW' : msg.mode === 'balanced' ? 'MEDIUM' : 'HIGH';
        const fps = [12,24,30,60].includes(msg.fps) ? msg.fps as 12|24|30|60 : 30;
        figma.ui.postMessage({type:'progress',message:`正在由 Figma 编码 ${frame.name} · ${scale}x MP4…`});
        let bytes: Uint8Array;
        try {
          bytes = await frame.exportAsync({format:'MP4',fps,quality,constraint:{type:'WIDTH',value:Math.max(1,Math.round(frame.width*scale))}});
        } catch (error) {
          throw new Error(`${frame.name} 无法导出 MP4：需要 Figma 支持的动态顶层 Frame。视频填充不一定构成可导出的动画，无法直接提取原始视频。详情：${String(error)}`);
        }
        if (cancelled) break;
        const receipt = new Promise<void>(resolve => { ack = resolve; });
        figma.ui.postMessage({type:'asset',bytes,format:'mp4',scale,index,name:frame.name,total,note:`Figma MP4 · ${fps} fps · ${quality} · 无二次压缩`});
        await receipt;
      }
      if (cancelled) break;
    }
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      for (const scale of scales) {
        if (cancelled) break;
        if (formats.some(f => ['png','jpeg','webp'].includes(f)) && (node.width * scale * node.height * scale > 32_000_000 || Math.max(node.width,node.height)*scale > 16384)) throw new Error(`${node.name} 的输出尺寸过大，请降低倍率或分批导出。`);
        let png: Uint8Array | undefined;
        for (const format of imageFormats) {
          if (cancelled) break;
          let bytes: Uint8Array;
          if (['png','jpeg','webp'].includes(format)) {
            png ??= await node.exportAsync({format:'PNG',constraint:{type:'SCALE',value:scale},colorProfile:'SRGB'});
            bytes = png;
          } else {
            bytes = await node.exportAsync({format:format === 'svg' ? 'SVG' : 'PDF',colorProfile:'SRGB'});
          }
          if (cancelled) break;
          const receipt = new Promise<void>(resolve => { ack = resolve; });
          figma.ui.postMessage({type:'asset', bytes, format, scale, index, name:node.name, total});
          await receipt;
        }
      }
      if (cancelled) break;
    }
    figma.ui.postMessage({type:'done',cancelled});
  } catch (error) { figma.ui.postMessage({type:'error',message:error instanceof Error ? error.message : String(error)}); }
  finally { busy = false; ack = undefined; }
};
