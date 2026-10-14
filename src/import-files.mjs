export const isArchive = file => /\.(zip|rar|7z)$/i.test(file.name);
export const isImportable = file => isImportImage(file)||isArchive(file);
export const isImportImage = file => /\.(png|jpe?g|webp)$/i.test(file.name);

// DirectoryReader returns batches; an empty batch signals the end.
export async function collectDroppedFiles(entries, fallback = []) {
 const files = [];
 async function visit(entry) {
  if (entry.isFile) {
   const file = await new Promise((resolve,reject)=>entry.file(resolve,reject));
   if (isImportable(file)) files.push(file);
  } else if (entry.isDirectory) {
   const reader = entry.createReader();
   while (true) {
    const batch = await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));
    if (!batch.length) break;
    for (const child of batch) await visit(child);
   }
  }
 }
 for (const entry of entries) await visit(entry);
 return [...files, ...fallback.filter(isImportable)];
}

export async function collectHandles(handles){
 const files=[];
 async function visit(handle){if(handle.kind==='file'){const file=await handle.getFile();if(isImportable(file))files.push(file);}else if(handle.kind==='directory'){for await(const child of handle.values())await visit(child);}}
 for(const handle of handles)if(handle)await visit(handle);
 return files;
}
