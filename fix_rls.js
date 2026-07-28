const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // Drop the problematic policy and recreate it without the (select) subquery
    // This prevents PostgreSQL from doing a lateral subquery per row which causes O(n) performance degradation
    // on queries that join the employees table (like batches, equipment, and lab_notebook)
    const sql = `
      DROP POLICY IF EXISTS "employees_auth_select" ON public.employees;
      CREATE POLICY "employees_auth_select" ON public.employees
        FOR SELECT USING (auth.role() = 'authenticated');
    `;
    
    await client.query(sql);
    console.log('Successfully updated employees_auth_select policy.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
