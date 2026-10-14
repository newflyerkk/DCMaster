import test from 'node:test';import assert from 'node:assert/strict';
import {parseScales,outputPath,equalPixels,features} from '../src/core.mjs';
test('倍率解析去重及拒绝非法值',()=>{assert.deepEqual(parseScales([1,2],'1.5x，2 4'),[1,1.5,2,4]);for(const v of ['NaN','0','-1','17'])assert.throws(()=>parseScales([],v));});
test('命名、防路径穿越、重名以及倍率后缀',()=>{const used=new Set();const a={format:'png',scale:1,index:0,name:'a/b'};assert.equal(outputPath(a,true,used),'png/1x/a_b.png');assert.equal(outputPath(a,true,used),'png/1x/a_b_2.png');assert.equal(outputPath({...a,scale:1.5},false,used),'png/1.5x/png_001@1.5x.png');});
test('透明像素也需要完全一致',()=>{const a={width:1,height:1,data:new Uint8Array([255,0,0,0])};const b={...a,data:new Uint8Array([0,0,0,0])};assert.equal(equalPixels(a,b),false);assert.equal(features(a).alpha,true);});
test('关闭倍率后缀仍保留倍率目录、对象原名和重名保护',()=>{
 const used=new Set(),a={format:'png',scale:2,index:0,name:'icon'};
 assert.equal(outputPath(a,true,used,false),'png/2x/icon.png');
 assert.equal(outputPath(a,true,used,false),'png/2x/icon_2.png');
 assert.equal(outputPath({...a,scale:3},true,used,false),'png/3x/icon.png');
 assert.equal(outputPath({...a,name:'icon@2x'},true,used,false),'png/2x/icon@2x.png');
 assert.equal(outputPath(a,false,used,false),'png/2x/png_001.png');
});
