const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key] = val.trim().replace(/^"|"$/g, '');
  return acc;
}, {});

async function check() {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/inventory_usage?select=id,quantity_used,created_at,inventory_stock(id,supplier_batch_number,inventory_items(name)),batches(id,batch_id,status,product_name)&order=created_at.desc&limit=10`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
check();
