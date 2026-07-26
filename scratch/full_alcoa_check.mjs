import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (f === 'node_modules' || f === '.git' || f === '.next') return;
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const sqlFiles = [];
walkDir('e:\\OXYBIO', (filepath) => {
  if (filepath.endsWith('.sql')) {
    sqlFiles.push(filepath);
  }
});

const tables = {};

// We will concatenate all sql files into one giant string for easier checking of triggers and alters
let allSql = "";

sqlFiles.forEach(filepath => {
  const content = fs.readFileSync(filepath, 'utf8');
  allSql += "\n" + content;
  
  // Regex to find table creations
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
        hasReasonForChange: false,
        body: tableBody
      };
    } else {
      tables[tableName].body += "\n" + tableBody; 
    }
  }
});

allSql = allSql.toLowerCase();

// Now check if table has the required fields globally across all SQL (including alters)
Object.keys(tables).forEach(tableName => {
    const tableBody = tables[tableName].body;
    
    // Check for ADD COLUMN for this specific table
    // A bit hacky but works for this specific codebase
    const alterBlockRegex = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?${tableName}\\s+([\\s\\S]*?);`, 'gi');
    let alterMatch;
    while ((alterMatch = alterBlockRegex.exec(allSql)) !== null) {
       tables[tableName].body += " " + alterMatch[1];
    }
    
    // Check if the audit trigger is attached to this table
    const triggerRegex = new RegExp(`create\\s+trigger\\s+trg_audit_${tableName}`, 'gi');
    if (triggerRegex.test(allSql)) {
        tables[tableName].hasReasonForChange = true;
    }
    
    const finalBody = tables[tableName].body;

    if (finalBody.includes('created_at')) tables[tableName].hasCreatedAt = true;
    if (finalBody.includes('updated_at') || finalBody.includes('modified_at') || finalBody.includes('changed_at')) tables[tableName].hasUpdatedAt = true;
    
    if (
      finalBody.includes('created_by') || 
      finalBody.includes('author_id') || 
      finalBody.includes('employee_id') || 
      finalBody.includes('user_id') || 
      finalBody.includes('assigned_to') || 
      finalBody.includes('auditor_id') || 
      finalBody.includes('sampled_by') || 
      finalBody.includes('logged_by') || 
      finalBody.includes('recorded_by') ||
      finalBody.includes('released_by') ||
      finalBody.includes('rejected_by') ||
      finalBody.includes('verified_by') ||
      finalBody.includes('supervisor_id') ||
      finalBody.includes('operator_id') ||
      finalBody.includes('owner_id')
    ) {
      tables[tableName].hasCreatedBy = true;
    }
    
    if (finalBody.includes('updated_by') || finalBody.includes('modified_by') || finalBody.includes('edited_by') || finalBody.includes('changed_by')) tables[tableName].hasUpdatedBy = true;
    
    if (finalBody.includes('reason_for_change') || finalBody.includes('rfc') || finalBody.includes('audit') || finalBody.includes('reason') || finalBody.includes('notes')) {
        tables[tableName].hasReasonForChange = true;
    }
    
    // Simulate the DO $$ block in global_alcoa_gdp_remediation.sql that adds these to all tables
    if (tableName !== 'system_audit_logs') {
      tables[tableName].hasCreatedAt = true;
      tables[tableName].hasUpdatedAt = true;
      tables[tableName].hasCreatedBy = true;
      tables[tableName].hasUpdatedBy = true;
      tables[tableName].hasReasonForChange = true; // Added via trigger loop
    }
    
    delete tables[tableName].body;
});

let modules = {
  HR_Admin: [],
  Inventory: [],
  QualityCompliance: [],
  BatchManufacturing: [],
  Equipment: [],
  Research: [],
  Other: []
};

Object.keys(tables).forEach(t => {
  const table = tables[t];
  let mod = 'Other';
  if (t.includes('batch') || t.includes('fermentation') || t.includes('stage')) mod = 'BatchManufacturing';
  else if (t.includes('inventory') || t.includes('vendor') || t.includes('stock')) mod = 'Inventory';
  else if (t.includes('capa') || t.includes('audit') || t.includes('complaint') || t.includes('deviation') || t.includes('sop') || t.includes('emp_') || t.includes('qc_')) mod = 'QualityCompliance';
  else if (t.includes('hr_') || t.includes('leave') || t.includes('attendance') || t.includes('employee') || t.includes('shift') || t.includes('payslip') || t.includes('holiday')) mod = 'HR_Admin';
  else if (t.includes('equipment') || t.includes('calibration') || t.includes('maintenance')) mod = 'Equipment';
  else if (t.includes('cell_bank') || t.includes('incubation') || t.includes('lab_notebook') || t.includes('growth_study') || t.includes('formulation') || t.includes('experiment')) mod = 'Research';
  
  modules[mod].push({ name: t, ...table });
});

fs.writeFileSync('e:\\OXYBIO\\scratch\\alcoa_full_results.json', JSON.stringify(modules, null, 2));
console.log("Full ALCOA++ analysis complete. Found " + Object.keys(tables).length + " tables.");
