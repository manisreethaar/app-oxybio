import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app');
const COMPONENTS_DIR = path.join(process.cwd(), 'components');

const replaceMap = {
  'text-\\[8px\\]': 'text-xs',
  'text-\\[9px\\]': 'text-xs',
  'text-\\[10px\\]': 'text-xs',
  'text-\\[11px\\]': 'text-xs',
  'text-\\[12px\\]': 'text-xs',
  'text-\\[13px\\]': 'text-sm',
  'text-\\[14px\\]': 'text-sm',
  'text-\\[15px\\]': 'text-base',
  'text-\\[16px\\]': 'text-base',
  'text-\\[17px\\]': 'text-lg',
  'text-\\[18px\\]': 'text-lg',
};

let filesModified = 0;

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function processDirectory(dir) {
  const files = getFiles(dir);
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    for (const [findRegex, replace] of Object.entries(replaceMap)) {
      const regex = new RegExp(findRegex, 'g');
      content = content.replace(regex, replace);
    }

    if (content !== original) {
      fs.writeFileSync(file, content);
      filesModified++;
    }
  }
}

console.log('Migrating typography in app/...');
processDirectory(APP_DIR);
console.log('Migrating typography in components/...');
processDirectory(COMPONENTS_DIR);

console.log(`Migration complete. Modified ${filesModified} files.`);
