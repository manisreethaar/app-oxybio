require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testMaintenanceFallback() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // 1. Get an existing equipment ID
  const { data: equipData } = await supabase.from('equipment').select('id').limit(1).single();
  if (!equipData) {
    console.log("No equipment found.");
    return;
  }
  const equipment_id = equipData.id;
  
  const updates = { status: 'Operational' };
  const next_due_date = '2026-08-01';
  updates.next_pm_date = next_due_date;
  
  console.log("Attempting to update equipment with missing column:", updates);
  
  const { error: updateErr } = await supabase.from('equipment').update(updates).eq('id', equipment_id);
  
  if (updateErr) {
    console.log("Update Error caught:", updateErr.message);
    if (updateErr.message && updateErr.message.includes('next_pm_date')) {
      console.log("Missing next_pm_date column detected! Stripping it and retrying fallback...");
      delete updates.next_pm_date;
      const { error: fallbackErr } = await supabase.from('equipment').update(updates).eq('id', equipment_id);
      if (fallbackErr) {
        console.error("Fallback failed:", fallbackErr);
      } else {
        console.log("Fallback Succeeded! Equipment status updated successfully without next_pm_date.");
      }
    } else {
      console.error("Different error occurred:", updateErr);
    }
  } else {
    console.log("Update succeeded on first try (columns exist).");
  }
}
testMaintenanceFallback();
