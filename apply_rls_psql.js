require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');
try {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  execSync(`psql "${dbUrl}" -f supabase/migrations/20260728000003_fix_titration_logs_rls.sql`, { stdio: 'inherit' });
  console.log('Migration applied');
} catch (e) {
  console.error('Failed', e.message);
}
