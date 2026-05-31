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

for (const fp of files) {
  let src = fs.readFileSync(fp, 'utf8');
  const original = src;
  
  if (src.includes('animate-slide-left')) {
    src = src.replace(/rounded-\[2rem\]/g, 'rounded-none');
    src = src.replace(/sm:rounded-\[2rem\]/g, '');
    src = src.replace(/ <div className=/g, '<div className=');
    src = src.replace(/sm:animate-slide-left animate-in zoom-in-95 duration-200/g, 'sm:animate-slide-left animate-in slide-in-from-bottom duration-200');
    src = src.replace(/sm:animate-slide-left md:animate-in fade-in zoom-in duration-200/g, 'sm:animate-slide-left animate-in slide-in-from-bottom duration-200');
  }

  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
  }
}
