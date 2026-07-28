const fs = require('fs');
const path = require('path');
const tableNames = new Set();
function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
        else if (fullPath.endsWith('.js') || fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const matches = content.matchAll(/supabase\.from\(['"]([^'"]+)['"]\)/g);
            for (const match of matches) {
                tableNames.add(match[1]);
            }
        }
    });
}
walk('e:/OXYBIO/app');
console.log(Array.from(tableNames).sort());
