import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/code.ts'],outfile:'dist/code.js',bundle:true,target:'es2017'});
const worker=await build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'iife',target:'es2020',loader:{'.wasm':'base64'},minify:true});
const archive=await build({entryPoints:['src/archive-worker.js'],external:['fs','path','crypto'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2020',loader:{'.wasm':'base64'},define:{process:'undefined'},minify:true});
const ui=await build({entryPoints:['src/ui.js'],bundle:true,write:false,format:'iife',target:'es2020',minify:true,define:{ARCHIVE_SOURCE:JSON.stringify(archive.outputFiles[0].text),WORKER_SOURCE:JSON.stringify(worker.outputFiles[0].text)}});
const {version}=JSON.parse(await readFile('package.json','utf8'));
const theme=await readFile('src/theme.css','utf8');
const html=(await readFile('src/ui.html','utf8')).replaceAll('{{VERSION}}',version).replace('</style>',theme+'\n</style>');
await writeFile('dist/ui.html',html.replace('<!--SCRIPT-->',()=>`<script>${ui.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`));
console.log('Built offline plugin: dist/code.js + dist/ui.html');

// Optional machine-local target: keep the manifest registered in Figma current.
await (await import('./scripts/deploy-local.mjs')).deployLocal();
