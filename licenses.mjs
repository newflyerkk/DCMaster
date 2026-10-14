import {readdir,readFile,writeFile} from 'node:fs/promises';
let text='# Third-party notices\n\nBundled dependencies retain their original licenses.\n';
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(!e.isDirectory()||e.name.startsWith('.'))continue;const path=dir+'/'+e.name;if(e.name.startsWith('@')){await scan(path);continue;}try{const pkg=JSON.parse(await readFile(path+'/package.json','utf8'));const files=(await readdir(path)).filter(n=>/^(license|copying|notice)(\.|$)/i.test(n));text+=`\n## ${pkg.name} ${pkg.version} (${pkg.license||'see source'})\n`;for(const f of files)text+='\n'+await readFile(path+'/'+f,'utf8')+'\n';}catch{}}}
await scan('node_modules');await writeFile('THIRD_PARTY_NOTICES.txt',text);
