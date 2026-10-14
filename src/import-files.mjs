export const isImportImage = file => /\.(png|jpe?g|webp)$/i.test(file.name);

// DirectoryReader returns batches; an empty batch signals the end.
export async function collectDroppedFiles(entries, fallback = []) {
 const files = [];
 async function visit(entry) {
  if (entry.isFile) {
   const file = await new Promise((resolve,reject)=>entry.file(resolve,reject));
   if (isImportImage(file)) files.push(file);
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
 return [...files, ...fallback.filter(isImportImage)];
}
