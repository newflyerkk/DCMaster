import {PDFDocument} from 'pdf-lib';
export async function mergePDFs(sources,scale=1,uncompressed=false){
 const document=await PDFDocument.create();
 for(const source of sources){const input=await PDFDocument.load(new Uint8Array(source),{updateMetadata:false});const pages=await document.copyPages(input,input.getPageIndices());for(const page of pages){if(scale!==1)page.scale(scale,scale);document.addPage(page);}}
 if(!document.getPageCount())throw Error('没有可合并的 PDF 页面。');
 const before=await document.save({useObjectStreams:false});
 const after=uncompressed?before:await document.save({useObjectStreams:true});
 return {before,after:after.length<before.length?after:before,pages:document.getPageCount()};
}
