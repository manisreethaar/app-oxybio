const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key] = val.trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase
    .from('inventory_usage')
    .select(`
      id,
      quantity_used,
      created_at,
      batch_id,
      stock_id,
      inventory_stock (
        id, supplier_batch_number,
        inventory_items (name)
      ),
      batches (
        id, batch_id, status, product_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log(JSON.stringify(data, null, 2));
  if (error) console.error(error);
}
check();
