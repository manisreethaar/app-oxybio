const fs = require('fs');
const path = require('path');

function walk(dir, exts) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.next', '.git'].includes(entry.name)) {
      results.push(...walk(full, exts));
    } else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const ROOT = __dirname;
const files = walk(path.join(ROOT, 'app'), ['.js', '.jsx', '.tsx']).concat(walk(path.join(ROOT, 'components'), ['.js', '.jsx', '.tsx']));
const changed = [];

for (const fp of files) {
  let src = fs.readFileSync(fp, 'utf8');
  const original = src;
  
  // 1. Remove my-auto
  src = src.replace(/className="my-auto /g, 'className="');
  src = src.replace(/className={`my-auto /g, 'className={`');

  // 2. Remove overflow-y-auto from outer fixed inset-0 wrappers
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('fixed inset-0')) {
      if (lines[i].includes('overflow-y-auto')) {
         lines[i] = lines[i].replace(' overflow-y-auto', '').replace('overflow-y-auto ', '');
      }
    }
    
    // 3. For the inner card, make sure it has max-h-[90vh] flex flex-col
    if (i > 0 && lines[i-1].includes('fixed inset-0') && lines[i].includes('bg-white')) {
       // Check if we need to add max-h
       if (!lines[i].includes('max-h-') && !lines[i].includes('h-screen')) {
          let add = ' max-h-[90vh] flex flex-col';
          if (lines[i].includes('flex-col')) add = ' max-h-[90vh]'; 
          
          if (lines[i].includes('className="')) {
             lines[i] = lines[i].replace('className="', 'className="' + add.trim() + ' ');
          } else if (lines[i].includes('className={`')) {
             lines[i] = lines[i].replace('className={`', 'className={`' + add.trim() + ' ');
          }
       }
       // Replace h-screen with max-h-[90vh]
       if (lines[i].includes('h-screen')) {
          lines[i] = lines[i].replace('h-screen', 'max-h-[90vh]');
       }
    }
  }
  src = lines.join('\n');

  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
    changed.push(fp.replace(ROOT + path.sep, ''));
  }
}
console.log('Reverted files:', changed);
