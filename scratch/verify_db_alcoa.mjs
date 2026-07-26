import { Client } from 'pg';
import fs from 'fs';

const env = fs.readFileSync('e:/OXYBIO/.env.local', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      acc[parts[0]] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    }
    return acc;
  }, {});

const client = new Client({
  connectionString: env.DATABASE_URL
});

async function run() {
  await client.connect();
  
  const tablesResult = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name NOT IN ('schema_migrations', 'spatial_ref_sys')
  `);

  const modules = {
    HR_Admin: [],
    Inventory: [],
    QualityCompliance: [],
    BatchManufacturing: [],
    Equipment: [],
    Research: [],
    Other: []
  };

  for (let row of tablesResult.rows) {
    const t = row.table_name;
    
    // Get columns
    const colsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [t]);
    const cols = colsResult.rows.map(c => c.column_name);

    // Get triggers
    const triggersResult = await client.query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_schema = 'public' AND event_object_table = $1
    `, [t]);
    const triggers = triggersResult.rows.map(tr => tr.trigger_name);

    const hasCreatedAt = cols.includes('created_at') || cols.includes('changed_at');
    const hasUpdatedAt = cols.includes('updated_at') || cols.includes('modified_at') || cols.includes('changed_at');
    const hasCreatedBy = cols.some(c => ['created_by','author_id','employee_id','user_id','assigned_to','auditor_id','sampled_by','logged_by','recorded_by','released_by','rejected_by','verified_by','supervisor_id','operator_id','owner_id', 'changed_by'].includes(c));
    const hasUpdatedBy = cols.some(c => ['updated_by','modified_by','edited_by','changed_by'].includes(c));
    const hasReasonForChange = cols.some(c => ['reason_for_change','rfc','audit','reason','notes'].includes(c)) || triggers.some(tr => tr.includes('audit'));

    const tableObj = {
      name: t,
      hasCreatedAt,
      hasUpdatedAt,
      hasCreatedBy,
      hasUpdatedBy,
      hasReasonForChange
    };

    let mod = 'Other';
    if (t.includes('batch') || t.includes('fermentation') || t.includes('stage')) mod = 'BatchManufacturing';
    else if (t.includes('inventory') || t.includes('vendor') || t.includes('stock')) mod = 'Inventory';
    else if (t.includes('capa') || t.includes('audit') || t.includes('complaint') || t.includes('deviation') || t.includes('sop') || t.includes('emp_') || t.includes('qc_')) mod = 'QualityCompliance';
    else if (t.includes('hr_') || t.includes('leave') || t.includes('attendance') || t.includes('employee') || t.includes('shift') || t.includes('payslip') || t.includes('holiday')) mod = 'HR_Admin';
    else if (t.includes('equipment') || t.includes('calibration') || t.includes('maintenance') || t.includes('ticket')) mod = 'Equipment';
    else if (t.includes('cell_bank') || t.includes('incubation') || t.includes('lab_notebook') || t.includes('growth_study') || t.includes('formulation') || t.includes('experiment')) mod = 'Research';
    
    modules[mod].push(tableObj);
  }

  fs.writeFileSync('e:/OXYBIO/scratch/alcoa_full_results.json', JSON.stringify(modules, null, 2));
  console.log("Database schema analysis complete.");
  await client.end();
}

run().catch(console.error);
