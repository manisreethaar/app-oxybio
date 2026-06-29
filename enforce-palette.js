const fs = require('fs');
const path = require('path');

const mappings = {
  // Primary & Neutral -> Slate
  'gray': 'slate',
  'zinc': 'slate',
  'blue': 'slate',
  'indigo': 'slate',
  'sky': 'slate',
  'fuchsia': 'slate',
  'cyan': 'slate',
  'purple': 'slate',

  // Success -> Emerald
  'green': 'emerald',

  // Warning -> Amber
  'yellow': 'amber',
  'orange': 'amber',

  // Danger -> Red
  'rose': 'red',
  'pink': 'red'
};

let filesChanged = 0;

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.css')) {
      const originalContent = fs.readFileSync(fullPath, 'utf8');
      let newContent = originalContent;

      // We only want to replace tailwind utility classes, so we use a strict regex.
      // Match: (bg|text|border|ring|hover:bg|hover:text...)-(color)-(shade)
      // We will loop over the mappings and apply regex for each
      for (const [oldColor, newColor] of Object.entries(mappings)) {
        // Regex explanation:
        // Word boundary, followed by optional modifiers like hover:, focus:, active:
        // Then bg|text|border|ring|stroke|fill|from|to|via
        // Then the old color
        // Then the shade (e.g. 50, 500, 900) optionally with opacity (e.g. /50)
        const regex = new RegExp(`\\b((?:(?:hover|focus|active|disabled|sm|md|lg|xl|2xl|dark):)*)(bg|text|border|ring|stroke|fill|from|to|via)-${oldColor}(-\\d{2,3}(?:\\/\\d{1,2})?)\\b`, 'g');
        newContent = newContent.replace(regex, `$1$2-${newColor}$3`);
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
