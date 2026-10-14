import test from 'node:test';import assert from 'node:assert/strict';import {visualError,pngProfiles} from '../src/png-quality.mjs';
const pixel=d=>({width:1,height:1,data:new Uint8Array(d)});
test('透明边缘同时在黑白背景验证，不能以透明RGB误差替代可见误差',()=>{
 assert.equal(visualError(pixel([255,0,0,0]),pixel([0,255,0,0])).max,0);
 assert.ok(Math.abs(visualError(pixel([255,255,255,255]),pixel([255,255,255,240])).max-15)<1e-9);
 assert.ok(Math.abs(visualError(pixel([0,0,0,255]),pixel([0,0,0,240])).max-15)<1e-9);
});
test('更激进档位包含温和候选和更大的误差预算',()=>{
 for(const [a,b] of [[pngProfiles.quality,pngProfiles.balanced],[pngProfiles.balanced,pngProfiles.size]]){
 assert.ok(a.colors.every(c=>b.colors.includes(c)));assert.ok(a.rms<b.rms);assert.ok(a.max<b.max);
 }
});
