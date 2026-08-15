const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function dump() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url);
  const data = await res.json();
  
  if (!data.definitions) {
    console.log("No definitions found in OpenAPI spec");
    return;
  }
  
  let sql = '-- Schema derived from PostgREST OpenAPI spec\n\n';
  
  for (const [tableName, tableDef] of Object.entries(data.definitions)) {
    if (!tableDef.properties) continue;
    
    sql += `CREATE TABLE public."${tableName}" (\n`;
    
    const columns = [];
    for (const [colName, colDef] of Object.entries(tableDef.properties)) {
      let type = colDef.format || colDef.type;
      
      // Default to text if unknown
      if (type === 'string') type = 'text';
      if (type === 'integer') type = 'integer';
      if (type === 'number') type = 'numeric';
      if (type === 'boolean') type = 'boolean';
      
      let line = `  "${colName}" ${type}`;
      if (tableDef.required && tableDef.required.includes(colName)) {
        line += ' NOT NULL';
      }
      
      // Attempt to infer defaults if provided in description
      if (colDef.default !== undefined) {
        let def = colDef.default;
        if (typeof def === 'string' && !def.includes('()') && type !== 'text') {
           // numeric or boolean defaults
        } else if (typeof def === 'string') {
           def = `'${def}'`;
        }
        line += ` DEFAULT ${def}`;
      }
      
      if (colDef.description && colDef.description.includes('Primary Key')) {
        line += ' PRIMARY KEY';
      }
      
      columns.push(line);
    }
    
    sql += columns.join(',\n') + '\n);\n\n';
  }
  
  fs.writeFileSync('schema_dump.sql', sql);
  console.log('Schema saved to schema_dump.sql');
}

dump().catch(console.error);
