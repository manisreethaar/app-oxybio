import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Client } from 'pg';
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => 
  client.query("SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'batch_flask_extract_addition'")
).then(res => {
  console.log(res.rows);
  client.end();
}).catch(console.error);
