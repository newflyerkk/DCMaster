import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDroppedFiles} from '../src/import-files.mjs';
const file=name=>({isFile:true,file(resolve){resolve({name});}});
const directory=batches=>({isDirectory:true,createReader(){let i=0;return {readEntries(resolve){resolve(batches[i++]||[]);}};}});
test('文件夹递归遍历全部批次，跳过其他文件，保留原名与重复名称',async()=>{
 const nested=directory([[file('同名.PNG'),file('说明.txt')],[file('照片.webp')]]);
 const root=directory([[file('同名.PNG'),nested],[file('照片.JPG')]]);
 const files=await collectDroppedFiles([root]);
 assert.deepEqual(files.map(f=>f.name),['同名.PNG','同名.PNG','照片.webp','照片.JPG']);
});
test('支持普通文件拖入、空目录及读取失败',async()=>{
 assert.deepEqual(await collectDroppedFiles([directory([])],[{name:'a.jpeg'},{name:'a.pdf'}]),[{name:'a.jpeg'}]);
 await assert.rejects(collectDroppedFiles([{isDirectory:true,createReader:()=>({readEntries(resolve,reject){reject(Error('无法读取'));}})}]),/无法读取/);
});
