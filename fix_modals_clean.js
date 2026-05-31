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
  
  // 1. Fix items-end to items-center (removes bottom sheet behavior on mobile)
  src = src.replace(/items-end sm:items-center/g, 'items-center');
  src = src.replace(/p-0 sm:p-4/g, 'p-4');

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // 2. InventoryClient drawer -> centered modal
    if (lines[i].includes('fixed inset-0') && lines[i].includes('justify-end')) {
      lines[i] = lines[i].replace('justify-end', 'justify-center p-4');
    }
    if (lines[i].includes('animate-slide-left') && lines[i].includes('h-screen')) {
      lines[i] = lines[i].replace('animate-slide-left', 'animate-in zoom-in-95 duration-200')
                         .replace('h-screen', 'max-h-[90vh]')
                         .replace('rounded-l-3xl', 'rounded-2xl')
                         .replace('max-w-xl', 'max-w-xl rounded-2xl'); 
    }
    
    // 3. Reduce excessive padding on modal bodies/headers that makes them look huge
    if (lines[i].includes('p-10') && (lines[i].includes('bg-white') || lines[i].includes('max-w-md'))) {
      lines[i] = lines[i].replace('p-10', 'p-6 md:p-8');
    }
    if (lines[i].includes('p-8') && lines[i].includes('bg-white')) {
      lines[i] = lines[i].replace('p-8', 'p-5 md:p-8');
    }
    
    // 4. Add max-h-[90vh] to bg-white inner modal cards if they don't have it (so they don't grow to 150vh and cut off)
    if (i > 0 && lines[i-1].includes('fixed inset-0') && lines[i].includes('bg-white') && !lines[i].includes('max-h-')) {
       let add = ' max-h-[90vh] flex flex-col overflow-hidden';
       if (lines[i].includes('flex-col')) add = ' max-h-[90vh] overflow-hidden';
       
       if (lines[i].includes('className="')) {
          lines[i] = lines[i].replace('className="', 'className="' + add.trim() + ' ');
       } else if (lines[i].includes('className={`')) {
          lines[i] = lines[i].replace('className={`', 'className={`' + add.trim() + ' ');
       }
    }
  }
  src = lines.join('\n');

  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
    changed.push(fp.replace(ROOT + path.sep, ''));
  }
}
console.log('Refactored files:', changed);
