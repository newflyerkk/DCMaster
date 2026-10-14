import {unpackArchive} from './archive.mjs';
self.onmessage=async({data})=>{try{const files=await unpackArchive(data.bytes,p=>/\.(png|jpe?g|webp)$/i.test(p));self.postMessage({files});}catch(error){self.postMessage({error:'解压失败：'+error.message});}};
