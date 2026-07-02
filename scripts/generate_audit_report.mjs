import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app');
const ARTIFACT_PATH = 'C:\\Users\\manis\\.gemini\\antigravity-ide\\brain\\881a50d0-510e-4601-ba18-ad0e3983ad20\\text_style_audit.md';

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

let md = `# Application Text & Style Audit\n\n`;
md += `This audit analyzes all modules in the application for text sizes, fonts, spacing, headers, footers, and menu/sidebar options. The goal is to identify inconsistencies and unify the design system for a professional look.\n\n`;

md += `> [!WARNING]\n`;
md += `> **Inconsistencies Found:** There is heavy usage of arbitrary text sizes (e.g., \`text-[8px]\`, \`text-[9px]\`, \`text-[10px]\`) alongside standard sizes (\`text-xs\`, \`text-sm\`). The application is lacking standard footers across modules, and typography weight is inconsistent.\n\n`;

for (const mod of modules) {
  const modPath = path.join(APP_DIR, mod);
  const files = getFiles(modPath);
  
  const modData = {
    textClasses: new Set(),
    fonts: new Set(),
    spacingClasses: new Set(),
    hasHeader: false,
    hasFooter: false,
    hasSidebar: false,
  };

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    const classRegex = /className=["']([^"']+)["']/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const classes = match[1].split(/\s+/);
      for (const cls of classes) {
        if (cls.startsWith('text-')) modData.textClasses.add(cls);
        if (cls.startsWith('font-')) modData.fonts.add(cls);
        if (/^(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|space)-/.test(cls)) {
          modData.spacingClasses.add(cls);
        }
      }
    }

    if (/<(header|Header)/.test(content) || /<nav/.test(content)) modData.hasHeader = true;
    if (/<(footer|Footer)/.test(content)) modData.hasFooter = true;
    if (/<(aside|Sidebar)/.test(content) || /sidebar/i.test(content)) modData.hasSidebar = true;
  }
  
  // Filter out some noise
  const texts = Array.from(modData.textClasses).filter(c => !c.includes('slate') && !c.includes('emerald') && !c.includes('red') && !c.includes('amber') && !c.includes('blue') && !c.includes('gray') && !c.includes('green') && !c.includes('white') && !c.includes('black')).sort();
  const colors = Array.from(modData.textClasses).filter(c => c.includes('slate') || c.includes('emerald') || c.includes('red') || c.includes('amber') || c.includes('blue')).sort();
  
  md += `## Module: \`${mod}\`\n`;
  md += `- **Header:** ${modData.hasHeader ? '✅ Present' : '❌ Missing'}\n`;
  md += `- **Footer:** ${modData.hasFooter ? '✅ Present' : '❌ Missing'}\n`;
  md += `- **Sidebar/Menu:** ${modData.hasSidebar ? '✅ Present' : '❌ Missing'}\n`;
  
  md += `- **Text Sizes/Alignments:** \n  \`${texts.join('`, `') || 'None'}\`\n`;
  md += `- **Text Colors (Sample):** \n  \`${colors.slice(0, 8).join('`, `') || 'None'}${colors.length > 8 ? ', ...' : ''}\`\n`;
  md += `- **Font Weights:** \n  \`${Array.from(modData.fonts).sort().join('`, `') || 'None'}\`\n`;
  
  const spacings = Array.from(modData.spacingClasses).sort();
  md += `- **Spacing Utility Count:** ${spacings.length} distinct utilities\n`;
  md += `- **Spacing Sample:** \n  \`${spacings.slice(0, 10).join('`, `') || 'None'}${spacings.length > 10 ? ', ...' : ''}\`\n\n`;
}

md += `## Design Standardization Recommendations\n\n`;
md += `1. **Typography Standardization**: Replace arbitrary values like \`text-[10px]\` and \`text-[11px]\` with standard Tailwind classes (\`text-xs\`, \`text-sm\`). Define a consistent heading scale.\n`;
md += `2. **Layout Consistency**: Ensure all modules wrap content in standard \`ClientLayout\` or similar layout component to guarantee global headers/footers/menus instead of redefining them per page.\n`;
md += `3. **Color Palette**: Limit text colors to \`text-slate-900\` for primary, \`text-slate-500\` for secondary, and use brand colors sparingly.\n`;

fs.writeFileSync(ARTIFACT_PATH, md);
console.log('Report generated at', ARTIFACT_PATH);
