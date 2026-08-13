const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/\r/g, '').replace(/^"|"$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findColumns() {
  const { data, error } = await supabase
    .from('batch_flask_separation')
    .select('*')
    .limit(1);
    
  if (data && data.length > 0) {
    console.log('Columns in batch_flask_separation:', Object.keys(data[0]));
  } else {
    // Force an error to see if it exists
    const { error: err } = await supabase.from('batch_flask_separation').insert({ id: '00000000-0000-0000-0000-000000000000' });
    console.log(err);
  }
}
findColumns();
