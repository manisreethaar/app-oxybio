import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const sqlFiles = [];
walkDir('e:\\OXYBIO\\supabase', (filepath) => {
  if (filepath.endsWith('.sql')) {
    sqlFiles.push(filepath);
  }
});

const tables = {};

sqlFiles.forEach(filepath => {
  const content = fs.readFileSync(filepath, 'utf8');
  // Very basic regex to find table creations and alters
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match;
  while ((match = createRegex.exec(content)) !== null) {
    const tableName = match[1].toLowerCase();
    const tableBody = match[2].toLowerCase();
    if (!tables[tableName]) {
      tables[tableName] = {
        hasCreatedAt: false,
        hasUpdatedAt: false,
        hasCreatedBy: false,
        hasUpdatedBy: false,
        body: tableBody
      };
    }
    
    // Contemporaneous check
    if (tableBody.includes('created_at')) tables[tableName].hasCreatedAt = true;
    if (tableBody.includes('updated_at')) tables[tableName].hasUpdatedAt = true;
    
    // Attributable check
    if (
      tableBody.includes('created_by') || 
      tableBody.includes('author_id') || 
      tableBody.includes('employee_id') || 
      tableBody.includes('user_id') || 
      tableBody.includes('assigned_to') || 
      tableBody.includes('auditor_id') || 
      tableBody.includes('sampled_by') || 
      tableBody.includes('logged_by') || 
      tableBody.includes('recorded_by') ||
      tableBody.includes('released_by') ||
      tableBody.includes('rejected_by') ||
      tableBody.includes('verified_by') ||
      tableBody.includes('supervisor_id')
    ) {
      tables[tableName].hasCreatedBy = true;
    }
    
    if (tableBody.includes('updated_by') || tableBody.includes('modified_by')) tables[tableName].hasUpdatedBy = true;
  }
});

// Group by modules basically
let modules = {
  BatchManufacturing: [],
  Inventory: [],
  QualityCompliance: [],
  HR_Admin: [],
  Equipment: [],
  Research: [],
  Other: []
};

Object.keys(tables).forEach(t => {
  const table = tables[t];
  let mod = 'Other';
  if (t.includes('batch') || t.includes('fermentation') || t.includes('stage')) mod = 'BatchManufacturing';
  else if (t.includes('inventory') || t.includes('vendor')) mod = 'Inventory';
  else if (t.includes('capa') || t.includes('audit') || t.includes('complaint') || t.includes('deviation') || t.includes('sop') || t.includes('emp_') || t.includes('qc_')) mod = 'QualityCompliance';
  else if (t.includes('hr_') || t.includes('leave') || t.includes('attendance') || t.includes('employee')) mod = 'HR_Admin';
  else if (t.includes('equipment') || t.includes('calibration')) mod = 'Equipment';
  else if (t.includes('cell_bank') || t.includes('incubation') || t.includes('lab_notebook')) mod = 'Research';
  
  modules[mod].push({ name: t, ...table });
});

fs.writeFileSync('e:\\OXYBIO\\scratch\\alcoa_results.json', JSON.stringify(modules, null, 2));
console.log("Done");
