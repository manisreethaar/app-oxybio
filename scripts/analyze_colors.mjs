import fs from 'fs';
import path from 'path';

const colors = new Map();
const ignoreColors = ['gray', 'slate', 'zinc', 'neutral', 'stone', 'white', 'black', 'transparent', 'current'];
const colorRegex = /\b(?:bg|text|border|ring|shadow|hover:bg|hover:text|hover:border)-([a-z]+)-\d+\b/g;

function analyzeDir(basePath, moduleName) {
  const dirents = fs.readdirSync(basePath, { withFileTypes: true });
  for (const dirent of dirents) {
    const p = path.join(basePath, dirent.name);
    if (dirent.isDirectory()) {
      analyzeDir(p, moduleName);
    } else if (dirent.name.match(/\.(js|jsx|ts|tsx)$/)) {
      const content = fs.readFileSync(p, 'utf8');
      let match;
      while ((match = colorRegex.exec(content)) !== null) {
        const color = match[1];
        if (!ignoreColors.includes(color)) {
          if (!colors.has(moduleName)) colors.set(moduleName, new Set());
          colors.get(moduleName).add(color);
        }
      }
    }
  }
}

const appDir = path.join(process.cwd(), 'app');
const entries = fs.readdirSync(appDir, { withFileTypes: true });
for (const d of entries) {
  if (d.isDirectory() && !d.name.startsWith('.')) {
    analyzeDir(path.join(appDir, d.name), d.name);
  }
}

// Also check components folder
analyzeDir(path.join(process.cwd(), 'components'), 'global_components');

const result = {};
for (const [mod, cols] of colors.entries()) {
  result[mod] = Array.from(cols).sort();
}

console.log(JSON.stringify(result, null, 2));
