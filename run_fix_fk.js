const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=\"?(postgresql:[^\"]+)\"?/);
if (match) {
  const { execSync } = require('child_process');
  console.log(execSync(`psql "${match[1]}" -f fix_fk.sql`).toString());
} else {
  console.log('No DATABASE_URL found');
}
