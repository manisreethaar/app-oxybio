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
  
  if (src.includes('animate-slide-left')) {
    src = src.replace(/flex items-center justify-end/g, 'flex items-stretch justify-end');
  }

  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
    changed.push(fp.replace(ROOT + path.sep, ''));
  }
}
console.log('Fixed drawer alignment in:', changed);
