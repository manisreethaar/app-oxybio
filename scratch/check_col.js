const fs = require('fs');
const lines = fs.readFileSync('e:/OXYBIO/schema_dump.sql', 'utf8').split('\n');
const match = lines.find(l => l.includes('dilution_factor') || l.includes('anthrone_od') || l.includes('gram_staining'));
if (match) {
  console.log('Found:', match);
  const idx = lines.findIndex(l => l === match);
  let tableIdx = idx;
  while(tableIdx > 0 && !lines[tableIdx].includes('CREATE TABLE')) {
    tableIdx--;
  }
  console.log('In table:', lines[tableIdx]);
} else {
  console.log('Not found in schema');
}
