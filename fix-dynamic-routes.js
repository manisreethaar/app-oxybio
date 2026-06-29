const fs = require('fs');
const path = require('path');

let fixed = 0;

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (file === 'route.js') {
      let content = fs.readFileSync(fullPath, 'utf8');

      // Target routes using supabase/server (which uses cookies internally), 
      // request.headers, or cookies() directly - but NOT yet having the dynamic export
      const needsDynamic = (
        content.includes("supabase/server") ||
        content.includes("cookies()") ||
        content.includes("request.headers") ||
        content.includes("supabase/admin")
      ) && !content.includes("export const dynamic");

      if (needsDynamic) {
        content = `export const dynamic = 'force-dynamic';\n` + content;
        fs.writeFileSync(fullPath, content);
        console.log(`Fixed: ${fullPath.replace('e:\\\\OXYBIO\\\\app\\\\api\\\\', '')}`);
        fixed++;
      }
    }
  }
}

processDir(path.join(__dirname, 'app', 'api'));
console.log(`\nDone. Fixed ${fixed} route files.`);
