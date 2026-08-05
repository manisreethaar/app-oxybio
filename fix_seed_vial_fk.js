require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

// Get the database URL - strip quotes if present
let dbUrl = process.env.DATABASE_URL || '';
dbUrl = dbUrl.replace(/^["']|["']$/g, '');

async function fixFk() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected to database');
  
  try {
    // Step 1: Drop old FK
    await client.query('ALTER TABLE seed_passages DROP CONSTRAINT IF EXISTS seed_passages_vial_id_fkey');
    console.log('✓ Dropped old FK constraint');
    
    // Step 2: Add correct FK to cell_bank_vials
    await client.query('ALTER TABLE seed_passages ADD CONSTRAINT seed_passages_vial_id_fkey FOREIGN KEY (vial_id) REFERENCES cell_bank_vials(id) ON DELETE SET NULL');
    console.log('✓ Added new FK constraint -> cell_bank_vials');
    
    // Step 3: Reload PostgREST schema cache
    await client.query("SELECT pg_notify('pgrst', 'reload schema')");
    console.log('✓ Notified PostgREST to reload schema');
    
    console.log('\n✅ Migration complete! seed_passages.vial_id now references cell_bank_vials.id');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

fixFk();
