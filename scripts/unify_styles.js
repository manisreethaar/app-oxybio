const fs = require('fs');
const path = require('path');

function replaceInFile(f) {
  const content = fs.readFileSync(f, 'utf8');
  let newContent = content.replace(/([\'\"\`])surface([\s\'\"\`])/g, '$1card$2');
  newContent = newContent.replace(/\b(bg|text|border|ring|shadow)-blue-(\d+)/g, '$1-violet-$2');
  newContent = newContent.replace(/\b(bg|text|border|ring|shadow)-indigo-(\d+)/g, '$1-violet-$2');
  newContent = newContent.replace(/\b(bg|text|border|ring|shadow)-sky-(\d+)/g, '$1-violet-$2');
  newContent = newContent.replace(/\b(bg|text|border|ring|shadow)-cyan-(\d+)/g, '$1-violet-$2');
  newContent = newContent.replace(/\b(hover:bg|hover:text|hover:border)-blue-(\d+)/g, '$1-violet-$2');
  newContent = newContent.replace(/\b(hover:bg|hover:text|hover:border)-indigo-(\d+)/g, '$1-violet-$2');

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
console.log('Global uniformation complete!');
