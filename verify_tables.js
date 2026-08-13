const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  'batches', 'batch_flasks', 'batch_flask_inoculations', 'tasks', 'notifications',
  'batch_fermentation_readings', 'batch_flask_straining', 'batch_flask_release_record',
  'batch_flask_endpoints', 'formulations', 'batch_flask_rejection_record',
  'batch_stage_media_prep', 'inventory_stock', 'deviations', 'batch_flask_qc_samples',
  'batch_flask_qc_tests', 'batch_flask_extract_addition', 'stage_transitions'
];

async function verifyTables() {
  const missing = [];
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        missing.push(table);
        console.error(`❌ Table missing: ${table}`);
      } else if (error.code === '42703' && error.message.includes('column')) {
        // Table exists, but 'id' column might be missing. We check with '*' instead.
        const { error: err2 } = await supabase.from(table).select('*').limit(1);
        if (err2 && err2.code === '42P01') {
            missing.push(table);
            console.error(`❌ Table missing: ${table}`);
        } else {
            console.log(`✅ Table exists (no 'id' column): ${table}`);
        }
      } else {
        console.error(`⚠️ Error checking ${table}:`, error);
      }
    } else {
      console.log(`✅ Table exists: ${table}`);
    }
  }
  
  if (missing.length === 0) {
    console.log('\nAll checked tables exist in the database!');
  } else {
    console.log(`\nMissing tables: ${missing.join(', ')}`);
  }
}

verifyTables();
