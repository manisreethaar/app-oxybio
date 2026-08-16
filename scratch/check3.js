const fs = require('fs');
const lines = fs.readFileSync('e:/OXYBIO/schema_dump.sql', 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('CREATE TABLE public."batch_fermentation_readings"'));
if (start > -1) {
  console.log(lines.slice(start, start + 30).join('\n'));
} else {
  console.log('batch_fermentation_readings not found');
}
