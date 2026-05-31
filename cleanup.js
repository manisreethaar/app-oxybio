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
  // Clean up duplicate max-h
  src = src.replace(/max-h-\[92vh\] /g, '');
  src = src.replace(/max-h-\[85vh\] /g, '');
  src = src.replace(/max-h-\[95vh\] /g, '');
  src = src.replace(/sm:rounded-none /g, '');
  src = src.replace(/rounded-t-3xl /g, '');
  src = src.replace(/rounded-t-2xl /g, '');
  fs.writeFileSync(fp, src, 'utf8');
}
