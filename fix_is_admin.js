const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function fixIsAdmin() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    host: new URL(process.env.DATABASE_URL).hostname,
    port: 5432,
    statement_timeout: 10000,
    keepAlive: true,
    connectionTimeoutMillis: 10000
  });
  
  try {
    await client.connect();
    console.log('Connected to DB');
    
    const query = `
      CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM employees 
          WHERE employees.email = auth.jwt()->>'email' AND role IN ('admin', 'ceo', 'cto')
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
    
    await client.query(query);
    console.log('is_admin function updated successfully.');
    
  } catch (err) {
    console.error('Error updating is_admin:', err);
  } finally {
    await client.end();
  }
}

fixIsAdmin();
