/**
 * FINAL verification — checks all modules are fully operational
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eofhppcmdhhfrptbxmxd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZmhwcGNtZGhoZnJwdGJ4bXhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAwMjk4NywiZXhwIjoyMDg5NTc4OTg3fQ.zGvSOSPeM-PlfizpFvEhWgWNMwkpGkyqYuTSjQXzDg8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const checks = [];

async function check(label, fn) {
  try {
    const result = await fn();
    checks.push({ label, ok: true, detail: result });
    console.log(`✅ ${label}: ${result}`);
  } catch (err) {
    checks.push({ label, ok: false, detail: err.message });
    console.log(`❌ ${label}: ${err.message}`);
  }
}

console.log('=== FINAL VERIFICATION ===\n');

// 1. Employees - the root fix
await check('Employees (directory)', async () => {
  const { count, error } = await supabase.from('employees').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} employees`;
});

// 2. LNB with full join
await check('Lab Notebook (with author)', async () => {
  const { data, error, count } = await supabase
    .from('lab_notebook_entries')
    .select('title, author:employees!lab_notebook_entries_created_by_fkey(full_name)', { count: 'exact' })
    .is('archived_at', null).limit(1);
  if (error) throw error;
  return `${count} entries, author="${data[0]?.author?.full_name || 'N/A'}"`;
});

// 3. Equipment with calibration_logs and log_type
await check('Equipment + calibration_logs (log_type column)', async () => {
  const { data, error, count } = await supabase
    .from('equipment')
    .select('name, calibration_logs(id, log_type, calibration_date)', { count: 'exact' })
    .order('name').limit(1);
  if (error) throw error;
  return `${count} equipment items`;
});

// 4. calibration_logs log_type column directly
await check('calibration_logs.log_type column exists', async () => {
  const { data, error } = await supabase
    .from('calibration_logs').select('id, log_type, status').limit(1);
  if (error) throw error;
  return `column present ✓`;
});

// 5. Payslips
await check('Payslips', async () => {
  const { count, error } = await supabase
    .from('payslips')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} payslips`;
});

// 6. Leave applications
await check('Leave Applications', async () => {
  const { count, error } = await supabase
    .from('leave_applications').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} records`;
});

// 7. Tasks
await check('Tasks', async () => {
  const { count, error } = await supabase
    .from('tasks').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} tasks`;
});

// 8. Batches
await check('Batches', async () => {
  const { count, error } = await supabase
    .from('batches').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} batches`;
});

// 9. Inventory items
await check('Inventory Items', async () => {
  const { count, error } = await supabase
    .from('inventory_items').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} items`;
});

// 10. Notifications
await check('Notifications', async () => {
  const { count, error } = await supabase
    .from('notifications').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count} notifications`;
});

// Summary
const passed = checks.filter(c => c.ok).length;
const failed = checks.filter(c => !c.ok).length;

console.log(`\n${'─'.repeat(40)}`);
console.log(`RESULT: ${passed}/${checks.length} checks passed`);
if (failed === 0) {
  console.log('🎉 ALL MODULES OPERATIONAL — Fix complete!');
} else {
  console.log(`⚠️  ${failed} issue(s) remain:`);
  checks.filter(c => !c.ok).forEach(c => console.log(`   • ${c.label}: ${c.detail}`));
}
