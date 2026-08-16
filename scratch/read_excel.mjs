import xlsx from 'xlsx';
import fs from 'fs';

const filePath = 'e:\\OXYBIO\\OB-FER-26-001_new_format (1).xlsx';
try {
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  console.log('Sheet Names:', sheetNames);

  for (const sheetName of sheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const worksheet = workbook.Sheets[sheetName];
    // Convert to JSON and take first 5 rows
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(JSON.stringify(data.slice(0, 5), null, 2));
  }
} catch (error) {
  console.error('Error:', error.message);
}
