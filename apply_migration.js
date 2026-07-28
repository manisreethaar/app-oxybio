const { execSync } = require('child_process');
require('dotenv').config({ path: '.env.local' });
try {
  execSync(`psql "${process.env.DATABASE_URL}" -c "ALTER TABLE equipment ADD COLUMN IF NOT EXISTS pm_frequency_days INTEGER; ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_pm_date DATE;"`, { stdio: 'inherit' });
  console.log("Migration applied successfully via psql.");
} catch (e) { 
  console.error('Failed to run psql. Make sure psql is in PATH.');
}
