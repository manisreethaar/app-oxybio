const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('getApiUser()') && !content.includes('import { getApiUser }')) {
    let newContent = content.replace(
      /import \{ createClient \}.*;/g,
      match => match + '\nimport { getApiUser } from \'@/utils/supabase/get-api-user\';'
    );
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent);
      console.log('Added import to:', filePath);
    } else {
      console.log('Could not find createClient to replace in:', filePath);
    }
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      walk(fullPath);
    } else if (file.name === 'route.js' || file.name === 'route.ts') {
      processFile(fullPath);
    }
  }
}

walk('e:/OXYBIO/app/api');
