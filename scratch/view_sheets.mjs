import xlsx from 'xlsx';
import fs from 'fs';

const filePath = 'e:\\OXYBIO\\OB-FER-26-001_new_format (1).xlsx';
const workbook = xlsx.readFile(filePath);

for (const sheetName of workbook.SheetNames) {
  if (['04_MEDIA RECIPE', '07_MEDIA PREP', '13_DOWNSTREAM', '15_PLATING'].includes(sheetName) || sheetName.includes('RECIPE')) {
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(`\n--- ${sheetName} ---`);
    console.log(JSON.stringify(data.slice(0, 8), null, 2));
  }
}
