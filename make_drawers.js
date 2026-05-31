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
  
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Look for the inner card we modified earlier
    // "h-[100dvh] sm:h-auto sm:max-h-[90vh]"
    if (
      i > 0 && 
      lines[i-1].includes('fixed inset-0') && 
      lines[i].includes('h-[100dvh]')
    ) {
        
        // 1. Modify the OUTER wrapper (lines[i-1]) to be p-0 and justify-end on desktop
        // Note: it currently might have `justify-center`, we want to change that to `justify-end`
        let outer = lines[i-1];
        outer = outer.replace(/justify-center/g, 'justify-end');
        outer = outer.replace(/p-0 sm:p-4/g, 'p-0');
        outer = outer.replace(/ p-4/g, ' p-0');
        lines[i-1] = outer;
        
        // 2. Modify the INNER card (lines[i])
        let inner = lines[i];
        
        // Replace h-[100dvh] sm:h-auto sm:max-h-[90vh] with h-[100dvh] sm:h-screen
        inner = inner.replace(/h-\[100dvh\] sm:h-auto sm:max-h-\[90vh\]/g, 'h-[100dvh] sm:h-screen');
        
        // Remove sm:rounded-2xl and rounded-2xl (it should be rounded-none everywhere to sit flush on right edge)
        inner = inner.replace(/sm:rounded-2xl/g, '');
        inner = inner.replace(/rounded-2xl/g, '');
        inner = inner.replace(/rounded-t-3xl/g, '');
        inner = inner.replace(/sm:rounded-none/g, '');
        
        // Add sm:animate-slide-left if not present
        if (!inner.includes('animate-slide-left')) {
           inner = inner.replace('flex-col', 'flex-col sm:animate-slide-left');
        }
        
        // Clean up any double spaces
        inner = inner.replace(/\s+/g, ' ');
        lines[i] = inner;
    }
  }
  src = lines.join('\n');

  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
    changed.push(fp.replace(ROOT + path.sep, ''));
  }
}
console.log('Modals converted to drawers:', changed);
