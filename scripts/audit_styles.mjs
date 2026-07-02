import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app');

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

const modules = fs.readdirSync(APP_DIR).filter(item => {
  const stat = fs.statSync(path.join(APP_DIR, item));
  return stat.isDirectory() && !item.startsWith('.') && item !== 'fonts' && item !== 'api';
});

const report = {};

for (const mod of modules) {
  const modPath = path.join(APP_DIR, mod);
  const files = getFiles(modPath);
  
  const modData = {
    textClasses: new Set(),
    spacingClasses: new Set(),
    hasHeader: false,
    hasFooter: false,
    hasSidebar: false,
    fonts: new Set(),
    pageTitles: new Set(),
  };

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Extract className="..."
    const classRegex = /className=["']([^"']+)["']/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const classes = match[1].split(/\s+/);
      for (const cls of classes) {
        if (cls.startsWith('text-')) modData.textClasses.add(cls);
        if (cls.startsWith('font-')) modData.fonts.add(cls);
        if (cls.startsWith('p-') || cls.startsWith('m-') || cls.startsWith('px-') || cls.startsWith('py-') || cls.startsWith('pt-') || cls.startsWith('pb-') || cls.startsWith('pl-') || cls.startsWith('pr-') || cls.startsWith('mt-') || cls.startsWith('mb-') || cls.startsWith('ml-') || cls.startsWith('mr-') || cls.startsWith('mx-') || cls.startsWith('my-') || cls.startsWith('gap-') || cls.startsWith('space-')) {
          modData.spacingClasses.add(cls);
        }
      }
    }

    if (content.includes('<header') || content.includes('<Header') || content.includes('header')) modData.hasHeader = true;
    if (content.includes('<footer') || content.includes('<Footer') || content.includes('footer')) modData.hasFooter = true;
    if (content.includes('<aside') || content.includes('<Sidebar') || content.includes('sidebar')) modData.hasSidebar = true;
    
    if (content.includes('page-title') || content.includes('text-2xl font-bold') || content.includes('text-3xl')) {
        // approximate check for titles
    }
  }

  report[mod] = {
    text: Array.from(modData.textClasses).sort().slice(0, 15),
    fonts: Array.from(modData.fonts).sort(),
    spacingCount: modData.spacingClasses.size,
    spacingSample: Array.from(modData.spacingClasses).sort().slice(0, 10),
    layout: {
      header: modData.hasHeader,
      footer: modData.hasFooter,
      sidebar: modData.hasSidebar
    }
  };
}

console.log(JSON.stringify(report, null, 2));
