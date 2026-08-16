const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    const query = `
      ALTER TABLE public.batch_fermentation_readings
      ADD COLUMN IF NOT EXISTS seed_train_id UUID,
      ADD COLUMN IF NOT EXISTS is_blank BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS gram_staining TEXT,
      ADD COLUMN IF NOT EXISTS microscopic_test TEXT,
      ADD COLUMN IF NOT EXISTS dilution_factor NUMERIC,
      ADD COLUMN IF NOT EXISTS logged_by_name TEXT,
      ADD COLUMN IF NOT EXISTS logged_by_role TEXT,
      ADD COLUMN IF NOT EXISTS anthrone_od NUMERIC,
      ADD COLUMN IF NOT EXISTS anthrone_conc NUMERIC,
      ADD COLUMN IF NOT EXISTS standard_curve_id UUID;
    `;
    
    await client.query(query);
    console.log('Added missing columns successfully.');
    
    // Check if the PostgREST schema cache needs reload
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log('Reloaded schema cache.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
