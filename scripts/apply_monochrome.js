const fs = require('fs');
const path = require('path');

const colorMap = {
  'violet-50': 'slate-100',
  'violet-100': 'slate-200',
  'violet-200': 'slate-300',
  'violet-300': 'slate-400',
  'violet-400': 'slate-500',
  'violet-500': 'slate-700',
  'violet-600': 'slate-800',
  'violet-700': 'slate-900',
  'violet-800': 'slate-900',
  'violet-900': 'slate-950',
  'violet-950': 'slate-950'
};

function replaceInFile(f) {
  const content = fs.readFileSync(f, 'utf8');
  let newContent = content;

  // Replace all tailwind violet classes with their slate mapped equivalents
  for (const [v, s] of Object.entries(colorMap)) {
    const regex = new RegExp(`\\b(bg|text|border|ring|shadow|hover:bg|hover:text|hover:border)-${v}\\b`, 'g');
    newContent = newContent.replace(regex, `$1-${s}`);
  }

  // Also catch bare text instances like text-violet-600 that might have been dynamically constructed
  // if they exist exactly.
  newContent = newContent.replace(/violet-/g, 'slate-'); // blanket fallback for things like focus:ring-violet-500

  if (content !== newContent) {
    fs.writeFileSync(f, newContent, 'utf8');
    console.log('Updated ' + f);
  }
}

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walkDir(p);
    } else if (p.match(/\.(js|jsx|ts|tsx)$/)) {
      replaceInFile(p);
    }
  });
}

walkDir(path.join(__dirname, '../app'));
walkDir(path.join(__dirname, '../components'));
console.log('Monochrome applied!');
