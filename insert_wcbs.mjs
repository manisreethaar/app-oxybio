import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const strainId = 'a9f42b02-63d5-4f71-858c-3094c6d6efca'; // Lactobacillus brevis MTCC 1750
  const parentId = '355ead5c-a0c3-4136-ae80-62c142780524'; // MCB prep

  // 1. First WCB (Commercial MRS agar, 30 vials)
  const prep2 = {
    strain_id: strainId,
    parent_id: parentId,
    type: 'WCB',
    prep_code: 'OB-CB-2026-002',
    status: 'Completed',
    vial_count: 30,
    notes: 'Prepared using Commercial MRS agar',
    completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: p2Data, error: p2Err } = await supabase
    .from('cell_bank_preparations')
    .insert(prep2)
    .select()
    .single();
    
  if (p2Err) {
    console.error('Error inserting prep2:', p2Err);
    return;
  }
  
  const vials2 = [];
  for (let i = 1; i <= 30; i++) {
    vials2.push({
      preparation_id: p2Data.id,
      vial_code: `OB-CB-2026-002-V${String(i).padStart(3, '0')}`,
      status: 'Available',
      created_at: prep2.created_at,
      updated_at: prep2.updated_at
    });
  }
  
  const { error: v2Err } = await supabase.from('cell_bank_vials').insert(vials2);
  if (v2Err) {
    console.error('Error inserting vials2:', v2Err);
    return;
  }
  console.log('Inserted WCB 1 (OB-CB-2026-002) with 30 vials.');

  // 2. Second WCB (Modified MRS agar, 45 vials - Yesterday)
  const prep3 = {
    strain_id: strainId,
    parent_id: parentId,
    type: 'WCB',
    prep_code: 'OB-CB-2026-003',
    status: 'Completed',
    vial_count: 45,
    notes: 'Prepared using modified MRS agar',
    completed_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: p3Data, error: p3Err } = await supabase
    .from('cell_bank_preparations')
    .insert(prep3)
    .select()
    .single();
    
  if (p3Err) {
    console.error('Error inserting prep3:', p3Err);
    return;
  }
  
  const vials3 = [];
  for (let i = 1; i <= 45; i++) {
    vials3.push({
      preparation_id: p3Data.id,
      vial_code: `OB-CB-2026-003-V${String(i).padStart(3, '0')}`,
      status: 'Available',
      created_at: prep3.created_at,
      updated_at: prep3.updated_at
    });
  }
  
  const { error: v3Err } = await supabase.from('cell_bank_vials').insert(vials3);
  if (v3Err) {
    console.error('Error inserting vials3:', v3Err);
    return;
  }
  console.log('Inserted WCB 2 (OB-CB-2026-003) with 45 vials.');
  
}

run().catch(console.error);
