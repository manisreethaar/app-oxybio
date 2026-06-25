const fs = require('fs');
const path = require('path');

const dirs = ['app', 'components', 'context', 'utils', 'supabase'];
const exts = ['.js', '.jsx', '.css', '.sql'];

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (exts.includes(path.extname(fullPath))) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('teal') || content.includes('Teal') || content.includes('TEAL')) {
                let newContent = content
                    .replace(/teal/g, 'violet')
                    .replace(/Teal/g, 'Violet')
                    .replace(/TEAL/g, 'VIOLET');
                if (newContent !== content) {
                    fs.writeFileSync(fullPath, newContent, 'utf8');
                    console.log(`Updated: ${fullPath}`);
                }
            }
        }
    }
}

dirs.forEach(walkDir);
console.log('Done replacing teal with violet.');
