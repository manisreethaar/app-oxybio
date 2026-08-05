const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=\"?(postgresql:[^\"]+)\"?/);
if (match) {
  const { execSync } = require('child_process');
  console.log(execSync(`psql "${match[1]}" -c "SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public';" -t`).toString());
} else {
  console.log('No DATABASE_URL found');
}
