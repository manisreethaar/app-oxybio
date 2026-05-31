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
    // 1. Identify outer wrappers and make them p-0 on mobile, p-4 on desktop (only if they wrap a large modal)
    // Actually, it's easier to just globally change p-4 to p-0 sm:p-4 on all fixed inset-0 wrappers, 
    // it won't hurt confirm dialogs much if they have p-0 because they shrink-to-fit anyway, 
    // BUT wait, if a confirm dialog has p-0, it might touch the screen edges if it's wide!
    // So we only do it if the inner card is made full screen.
    
    // Let's identify the inner white card.
    // If it has bg-white AND (max-w-lg, max-w-xl, max-w-2xl, max-w-3xl, max-w-4xl, max-w-5xl, max-w-full)
    // We make it full screen on mobile!
    if (
      i > 0 && 
      lines[i-1].includes('fixed inset-0') && 
      lines[i].includes('bg-white') && 
      (lines[i].match(/max-w-(lg|xl|2xl|3xl|4xl|5xl|full)/) || lines[i].includes('w-full') && !lines[i].includes('max-w-sm') && !lines[i].includes('max-w-md'))
    ) {
        
        // 1. Modify the OUTER wrapper (lines[i-1]) to have p-0 sm:p-4
        if (lines[i-1].includes(' p-4') && !lines[i-1].includes('sm:p-4')) {
           lines[i-1] = lines[i-1].replace(' p-4', ' p-0 sm:p-4');
        }
        
        // 2. Modify the INNER card (lines[i])
        let inner = lines[i];
        
        // Replace rounded-2xl or rounded-3xl or rounded-xl with rounded-none sm:rounded-2xl
        inner = inner.replace(/rounded-(xl|2xl|3xl|lg|md)/g, 'rounded-none sm:rounded-2xl');
        // If it somehow already has sm:rounded-2xl, we might get rounded-none sm:rounded-none sm:rounded-2xl.
        // Let's just do a safer replace:
        inner = inner.replace(/rounded-none sm:rounded-2xl/g, 'rounded-2xl'); // undo if duplicate
        inner = inner.replace(/rounded-2xl/g, 'rounded-none sm:rounded-2xl');
        
        // Replace max-h-[90vh] with h-[100dvh] sm:h-auto sm:max-h-[90vh]
        if (inner.includes('max-h-[90vh]')) {
           inner = inner.replace('max-h-[90vh]', 'h-[100dvh] sm:h-auto sm:max-h-[90vh]');
        } else if (!inner.includes('h-[100dvh]')) {
           // Add it if missing
           if (inner.includes('className="')) {
             inner = inner.replace('className="', 'className="h-[100dvh] sm:h-auto sm:max-h-[90vh] ');
           } else if (inner.includes('className={`')) {
             inner = inner.replace('className={`', 'className={`h-[100dvh] sm:h-auto sm:max-h-[90vh] ');
           }
        }
        
        // Ensure flex flex-col is present so inner scrolling works
        if (!inner.includes('flex-col')) {
            inner = inner.replace('className="', 'className="flex flex-col ');
        }
        
        lines[i] = inner;
    }
  }
  src = lines.join('\n');

  if (src !== original) {
    fs.writeFileSync(fp, src, 'utf8');
    changed.push(fp.replace(ROOT + path.sep, ''));
  }
}
console.log('Fullscreen modals created:', changed);
