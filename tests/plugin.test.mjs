import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('Figma 导出队列覆盖多对象、格式、倍率且不修改节点',async()=>{
 const messages=[],calls=[];let finished;const done=new Promise(r=>finished=r);
 const nodes=['卡片','图标'].map((name,i)=>({id:String(i),name,width:100,height:50,exportAsync:async opts=>{calls.push(opts);return new Uint8Array([1,2]);}}));
 const figma={showUI(){},on(){},currentPage:{selection:nodes,on(){}},ui:{postMessage:m=>{messages.push(m);if(m.type==='asset')queueMicrotask(()=>figma.ui.onmessage({type:'ack'}));if(['done','error'].includes(m.type))finished();}}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 figma.ui.onmessage({type:'prepare',formats:['png','jpeg','webp','svg','pdf'],scales:[1,2]});await done;
 assert.equal(messages.filter(m=>m.type==='asset').length,20);assert.equal(messages.at(-1).type,'done');assert.equal(calls.filter(c=>c.format==='PNG').length,4);assert.equal(calls.filter(c=>c.format==='PDF').length,4);
});
test('MP4 定位顶层 Frame、去重并传递质量帧率及自定义尺寸',async()=>{
 const messages=[],calls=[];const frame={id:'frame',name:'视频',width:200,exportAsync:async o=>{calls.push(o);return new Uint8Array([0,0,0,24,102,116,121,112]);}};
 const nodes=[1,2].map(id=>({id:String(id),name:'视频图层',width:200,height:100,getTopLevelFrame:()=>frame}));
 const figma={showUI(){},on(){},currentPage:{selection:nodes,on(){}},ui:{postMessage:m=>{messages.push(m);if(m.type==='asset')queueMicrotask(()=>figma.ui.onmessage({type:'ack'}));}}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'prepare',formats:['mp4'],scales:[1,2.5],fps:24,mode:'balanced'});
 assert.equal(calls.length,2);assert.equal(calls[1].constraint.value,500);assert.equal(calls[0].quality,'MEDIUM');assert.equal(calls[0].fps,24);assert.equal(messages.filter(m=>m.type==='asset').length,2);assert.equal(messages.at(-1).type,'done');
});
test('MP4 对没有顶层 Frame 的选区返回明确错误',async()=>{
 const messages=[];const figma={showUI(){},on(){},currentPage:{selection:[{name:'视频',getTopLevelFrame:()=>null}],on(){}},ui:{postMessage:m=>messages.push(m)}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'prepare',formats:['mp4'],scales:[1]});assert.equal(messages.at(-1).type,'error');assert.match(messages.at(-1).message,/顶层 Frame/);
});

test('图片导入保留完整文件名、原尺寸和透明背景，并选中新 Frame',async()=>{
 const messages=[],frames=[];
 const makeNode=()=>({resize(w,h){this.width=w;this.height=h;},remove(){this.removed=true;}});
 const figma={showUI(){},on(){},currentPage:{selection:[],on(){}},viewport:{center:{x:100,y:200},bounds:{width:1200},scrollAndZoomIntoView(nodes){assert.equal(nodes.length,2);}},createImage:()=>({hash:'original',getSizeAsync:async()=>({width:640,height:480})}),createFrame:()=>{const f={...makeNode(),appendChild(n){this.child=n;}};frames.push(f);return f;},createRectangle:makeNode,commitUndo(){},ui:{postMessage:m=>messages.push(m)}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'import-images',files:['图标 1.png','图标 1.png'].map(name=>({name,bytes:new Uint8Array([1])}))});
 assert.equal(messages.at(-1).count,2);
 for(const f of frames){assert.equal(f.name,'图标 1');assert.equal(f.child.name,f.name);assert.equal(f.width,640);assert.equal(f.height,480);assert.equal(f.child.width,640);assert.equal(f.child.height,480);assert.equal(f.fills.length,0);assert.equal(f.child.fills[0].imageHash,'original');}
 assert.equal(frames[1].x,100);assert.equal(frames[1].y,720);assert.equal(figma.currentPage.selection.length,2);assert.equal(figma.currentPage.selection[0],frames[0]);
});
test('损坏图片导致批次失败时移除已创建的 Frame',async()=>{
 const messages=[],frames=[];let images=0;
 const figma={showUI(){},on(){},currentPage:{selection:[],on(){}},viewport:{center:{x:0,y:0},bounds:{width:1200}},createImage(){if(++images===2)throw Error('损坏图片');return {hash:'ok',getSizeAsync:async()=>({width:10,height:20})};},createFrame(){const f={resize(){},appendChild(){},remove(){this.removed=true;}};frames.push(f);return f;},createRectangle:()=>({resize(){}}),ui:{postMessage:m=>messages.push(m)}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'import-images',files:['ok.png','bad.png'].map(name=>({name,bytes:new Uint8Array([1])}))});
 assert.match(messages.at(-1).error,/损坏/);assert.equal(frames[0].removed,true);
});
test('多选对象 GIF 按选区顺序发送帧，每倍率输出一个动画',async()=>{
 const messages=[];const nodes=[1,2].map(id=>({name:'对象'+id,width:10,height:20,exportAsync:async()=>new Uint8Array([id])}));
 const figma={showUI(){},on(){},currentPage:{selection:nodes,on(){}},ui:{postMessage:m=>{messages.push(m);if(m.type==='asset')queueMicrotask(()=>figma.ui.onmessage({type:'ack'}));}}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'prepare',formats:['gif'],scales:[1,2],gifDelay:300});
 const assets=messages.filter(m=>m.type==='asset');assert.equal(assets.length,2);assert.equal(assets[0].frames[0][0],1);assert.equal(assets[0].frames[1][0],2);assert.equal(assets[0].delay,300);assert.equal(assets[1].scale,2);assert.equal(assets[0].total,2);
});
test('取消 Frame 选项后图片直接置于页面，保持名称、尺寸与位置',async()=>{
 const messages=[],rectangles=[];
 const page={selection:[],on(){},appendChild(n){n.parent=this;}};
 const figma={showUI(){},on(){},currentPage:page,viewport:{center:{x:100,y:200},bounds:{width:1200},scrollAndZoomIntoView(){}},createImage:()=>({hash:'image',getSizeAsync:async()=>({width:54,height:54})}),createFrame(){throw Error('不应创建 Frame');},createRectangle(){const n={resize(w,h){this.width=w;this.height=h;},remove(){}};rectangles.push(n);return n;},commitUndo(){},ui:{postMessage:m=>messages.push(m)}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'import-images',createFrames:false,files:[{name:'close.png',bytes:new Uint8Array([1])}]});
 assert.equal(rectangles[0].name,'close');assert.equal(rectangles[0].width,54);assert.equal(rectangles[0].height,54);assert.equal(rectangles[0].x,100);assert.equal(rectangles[0].y,200);assert.equal(rectangles[0].parent,page);assert.equal(page.selection[0],rectangles[0]);assert.equal(messages.at(-1).createFrames,false);
});
test('不压缩 JPEG 调用 Figma 原生 JPG 导出并标记原生字节',async()=>{
 const calls=[],messages=[];const figma={showUI(){},on(){},currentPage:{selection:[{name:'原图',width:54,height:54,exportAsync:async o=>{calls.push(o);return new Uint8Array([1,2,3]);}}],on(){}},ui:{postMessage:m=>{messages.push(m);if(m.type==='asset')queueMicrotask(()=>figma.ui.onmessage({type:'ack'}));}}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});await figma.ui.onmessage({type:'prepare',formats:['jpeg'],scales:[2],mode:'none'});assert.equal(calls[0].format,'JPG');assert.equal(calls[0].constraint.value,2);assert.equal(messages.find(m=>m.type==='asset').native,true);
});
test('选项写入本地存储并在下次 ready 恢复',async()=>{
 const storage=new Map(),messages=[];const figma={showUI(){},on(){},currentPage:{selection:[],on(){}},clientStorage:{getAsync:async k=>storage.get(k),setAsync:async(k,v)=>storage.set(k,v)},ui:{postMessage:m=>messages.push(m)}};
 vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});
 await figma.ui.onmessage({type:'save-preferences',value:{named:false,'scale-suffix':false}});await new Promise(r=>setTimeout(r,0));await figma.ui.onmessage({type:'ready'});assert.equal(messages.at(-1).value.named,false);assert.equal(messages.at(-1).value['scale-suffix'],false);
});
test('合并 PDF 按画布绝对位置横排或竖列，不受选区顺序影响',async()=>{
 for(const [order,expected] of [['row',['A','B','C','D']],['column',['A','C','B','D']]]){
  const messages=[],calls=[];const nodes=[['D',200,200],['B',200,2],['C',0,200],['A',0,0]].map(([name,x,y])=>({name,x:999,y:999,width:100,height:100,absoluteBoundingBox:{x,y,width:100,height:100},exportAsync:async opts=>{calls.push({name,format:opts.format});return new Uint8Array([name.charCodeAt(0)]);}}));
  const figma={showUI(){},on(){},currentPage:{selection:nodes,on(){}},ui:{postMessage:m=>{messages.push(m);if(m.type==='asset')queueMicrotask(()=>figma.ui.onmessage({type:'ack'}));}}};
  vm.runInNewContext(readFileSync('dist/code.js','utf8'),{figma,__html__:'',Uint8Array});await figma.ui.onmessage({type:'prepare',formats:['pdf','png'],scales:[1,2],mergePDF:true,pdfOrder:order});
  assert.deepEqual(calls.filter(c=>c.format==='PDF').slice(0,4).map(c=>c.name),expected);
  const merged=messages.filter(m=>m.pdfSources);assert.equal(merged.length,2);assert.equal(merged[0].total,10);assert.deepEqual(Array.from(merged[0].pdfSources,b=>String.fromCharCode(b[0])),expected);assert.equal(messages.filter(m=>m.type==='asset').length,10);assert.equal(nodes[0].x,999);
 }
});
