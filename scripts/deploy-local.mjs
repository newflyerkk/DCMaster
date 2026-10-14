import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function deployLocal(){
 let config;
 try{config=JSON.parse(await readFile(path.join(root,'.local-deploy.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')return;throw error;}
 const target=path.resolve(root,config.target);
 if(target===root)return;
 const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 const installed=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));
 if(installed.id!==manifest.id)throw Error('本地目标不是同一插件，停止更新。');
 // Only deploy the registered manifest and its two runtime files; preserve source.
 for(const file of [manifest.main,manifest.ui,'manifest.json']){
  if(path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))throw Error('无效的插件文件路径。');
  const destination=path.join(target,file);await mkdir(path.dirname(destination),{recursive:true});
  const temp=destination+'.deploy-tmp';await copyFile(path.join(root,file),temp);await rename(temp,destination);
 }
 const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 console.log(`Updated local plugin to v${version}: ${target}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await deployLocal();
