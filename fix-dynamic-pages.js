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
    } else if (file === 'page.js' || file === 'layout.js') {
      let content = fs.readFileSync(fullPath, 'utf8');

      // Target page.js and layout.js files using supabase/server or cookies()
      const needsDynamic = (
        content.includes("supabase/server") ||
        content.includes("cookies()") ||
        content.includes("request.headers") ||
        content.includes("supabase/admin")
      ) && !content.includes("export const dynamic");

      if (needsDynamic) {
        // Only inject at the top, respecting 'use client' or 'use server' if present
        const dynamicLine = `export const dynamic = 'force-dynamic';\n`;
        
        if (content.startsWith("'use client'") || content.startsWith('"use client"')) {
          // Client components shouldn't typically have force-dynamic, but if they use server code, they're broken anyway.
          // Wait, 'use client' pages don't use cookies() or supabase/server directly, they use supabase/client.
          // We can skip 'use client' just to be safe.
          continue; 
        }

        if (content.startsWith("'use server'") || content.startsWith('"use server"')) {
          content = content.replace(/^('use server'|"use server")\n/, `$1\n${dynamicLine}`);
        } else {
          content = dynamicLine + content;
        }
        
        fs.writeFileSync(fullPath, content);
        console.log(`Fixed: ${fullPath.replace('e:\\\\OXYBIO\\\\', '')}`);
        fixed++;
      }
    }
  }
}

processDir(path.join(__dirname, 'app'));
console.log(`\nDone. Fixed ${fixed} page/layout files.`);
