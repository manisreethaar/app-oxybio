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
let totalChanged = 0;

for (const fp of files) {
  let src = fs.readFileSync(fp, 'utf8');
  let original = src;
  
  src = src.replace(/(fixed inset-0[^"'>]*?)(bg-(?:slate|gray|red|black|white|zinc)[a-zA-Z0-9\-\/]+(?:\s+backdrop-blur-[a-zA-Z0-9\-]+)?)/g, '$1bg-transparent');
  src = src.replace(/(fixed inset-0[^"'>]*?)(backdrop-blur-[a-zA-Z0-9\-]+)/g, '$1');
  
  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
    totalChanged++;
  }
}
console.log('Total files updated: ' + totalChanged);
