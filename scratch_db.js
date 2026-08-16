const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const tables = ['batch_seed_trains', 'batch_flasks', 'batch_fermentation_readings', 'inventory_stock', 'inventory_transactions'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    console.log(`--- ${t} ---`);
    if (error) console.error(error.message);
    else if (data.length > 0) console.log(Object.keys(data[0]));
    else {
      // no data, insert a dummy record and rollback (or just check error) to get columns
      const { error: insertError } = await supabase.from(t).insert({}).select('*');
      if (insertError) {
         // This might fail due to null constraints, but the error message often contains column hints or we can just try another way.
         console.log(insertError.message || insertError);
      }
    }
  }
}

run();
