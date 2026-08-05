const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=\"?(postgresql:[^\"]+)\"?/);

async function fix() {
  if (match) {
    const client = new Client({ connectionString: match[1] });
    await client.connect();
    console.log("Connected to DB.");
    
    try {
      await client.query('ALTER TABLE seed_passages DROP CONSTRAINT IF EXISTS seed_passages_vial_id_fkey;');
      console.log("Dropped constraint.");
      await client.query('ALTER TABLE seed_passages ADD CONSTRAINT seed_passages_vial_id_fkey FOREIGN KEY (vial_id) REFERENCES cell_bank_vials(id) ON DELETE SET NULL;');
      console.log("Added constraint.");
    } catch (e) {
      console.error(e.message);
    }
    
    await client.end();
  } else {
    console.log("No URL");
  }
}
fix();
