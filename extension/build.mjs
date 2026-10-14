import {build} from 'esbuild';
await build({entryPoints:['extension/src/main.js'],outfile:'extension/dist/main.js',bundle:true,format:'iife',target:'chrome111',minify:true,legalComments:'eof'});
console.log('Built companion extension');
