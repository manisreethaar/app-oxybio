const fs = require('fs');
const path = require('path');

const colorRegex = /\b(bg|text|border|ring)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{2,3}(?:\/\d{1,2})?)?\b/g;

const colors = {};

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      let match;
      while ((match = colorRegex.exec(content)) !== null) {
        const family = match[2]; // e.g., 'slate', 'red'
        const type = match[1]; // e.g., 'bg', 'text'
        const fullClass = match[0];
        
        if (!colors[family]) colors[family] = { total: 0, files: new Set(), classes: new Set() };
        
        colors[family].total++;
        colors[family].files.add(fullPath.replace('e:\\OXYBIO\\', ''));
        colors[family].classes.add(fullClass);
      }
    }
  }
}

processDir(path.join(__dirname, 'app'));
processDir(path.join(__dirname, 'components'));

const summary = [];
for (const [family, data] of Object.entries(colors)) {
  const topFiles = Array.from(data.files).slice(0, 3).join(', ') + (data.files.size > 3 ? ` (+${data.files.size - 3} more)` : '');
  const topClasses = Array.from(data.classes).slice(0, 5).join(', ') + (data.classes.size > 5 ? '...' : '');
  
  summary.push({
    Family: family,
    Occurrences: data.total,
    Classes: topClasses,
    UsedIn: topFiles
  });
}

// Sort by occurrences descending
summary.sort((a, b) => b.Occurrences - a.Occurrences);

console.log(JSON.stringify(summary, null, 2));
