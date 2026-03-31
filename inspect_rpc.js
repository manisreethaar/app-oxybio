require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase.rpc('deduct_inventory_stock', {
      id_to_deduct: '00000000-0000-0000-0000-000000000000',
      quantity_to_deduct: 1
    });
  console.log("Error:", error?.message || "Function exists (returned no fatal RPC not found error)");
}
test();
