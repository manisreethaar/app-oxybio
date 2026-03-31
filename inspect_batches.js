require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function checkBatches() {
  const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  // Try to insert a dummy batch to get the check constraint error details
  // Or fetch existing ones to see what variant values they have
  const { data, error } = await supabase.from('batches').select('variant').limit(10);
  console.log("Existing variants:", data);
}
checkBatches();
