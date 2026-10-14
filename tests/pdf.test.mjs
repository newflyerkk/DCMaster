import test from 'node:test';import assert from 'node:assert/strict';import {PDFDocument} from 'pdf-lib';import {mergePDFs} from '../src/pdf.mjs';
test('合并 PDF 保留源页面顺序并正确缩放每页',async()=>{
 const sources=[];for(const [w,h] of [[100,50],[200,80],[90,150]]){const d=await PDFDocument.create();d.addPage([w,h]).drawRectangle({x:0,y:0,width:10,height:10});sources.push(await d.save());}
 for(const uncompressed of [false,true]){const result=await mergePDFs(sources,2,uncompressed);const merged=await PDFDocument.load(result.after);assert.equal(merged.getPageCount(),3);assert.deepEqual(merged.getPages().map(p=>[p.getWidth(),p.getHeight()]),[[200,100],[400,160],[180,300]]);assert.ok(result.after.length);if(uncompressed)assert.equal(result.before,result.after);}
});
