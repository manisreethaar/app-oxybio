const fs = require('fs');
const path = require('path');

const mappings = {
  'blue': 'slate',
  'gray': 'slate',
  'zinc': 'slate'
};

let filesChanged = 0;

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      const originalContent = fs.readFileSync(fullPath, 'utf8');
      let newContent = originalContent;

      for (const [oldColor, newColor] of Object.entries(mappings)) {
        // Regex: (bg|text|border|ring|stroke|fill)-(oldColor)-(shade)
        // Ensure it handles quotes and spaces correctly
        const regex = new RegExp(`(bg|text|border|ring|stroke|fill)-${oldColor}-(\\d{2,3}(?:\\/\\d{1,2})?)`, 'g');
        newContent = newContent.replace(regex, `$1-${newColor}-$2`);
      }

      if (originalContent !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Unified colors in: ${fullPath.replace('e:\\\\OXYBIO\\\\', '')}`);
        filesChanged++;
      }
    }
  }
}

processDir(path.join(__dirname, 'app'));
processDir(path.join(__dirname, 'components'));

console.log(`\nDone. Strict color palette enforced on ${filesChanged} files.`);
