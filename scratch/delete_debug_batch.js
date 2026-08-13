const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deleteDebugBatch() {
  const { data, error } = await supabase
    .from('batches')
    .delete()
    .eq('batch_id', 'DEBUG-123');

  if (error) {
    console.error('Error deleting batch:', error);
  } else {
    console.log('Batch DEBUG-123 deleted successfully.');
  }
}

deleteDebugBatch();
