// Diagnostic script: check what data exists in Cell Bank tables
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eofhppcmdhhfrptbxmxd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZmhwcGNtZGhoZnJwdGJ4bXhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAwMjk4NywiZXhwIjoyMDg5NTc4OTg3fQ.zGvSOSPeM-PlfizpFvEhWgWNMwkpGkyqYuTSjQXzDg8'; // service role - bypasses RLS

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function diagnose() {
  console.log('=== Cell Bank Diagnostic ===\n');

  // 1. Check strains
  const { data: strains, error: strainsErr } = await supabase
    .from('cell_bank_strains')
    .select('id, name, source_type, accession_number, created_at')
    .order('created_at', { ascending: false });

  console.log('--- cell_bank_strains ---');
  if (strainsErr) {
    console.error('ERROR:', strainsErr.message, '| code:', strainsErr.code);
  } else {
    console.log(`Rows found: ${strains?.length ?? 0}`);
    strains?.forEach(s => console.log(` - [${s.id.slice(0,8)}] ${s.name} (${s.source_type}) created: ${s.created_at}`));
  }

  // 2. Check preparations
  const { data: preps, error: prepsErr } = await supabase
    .from('cell_bank_preparations')
    .select('id, prep_code, type, status, strain_id, vial_count, created_at')
    .order('created_at', { ascending: false });

  console.log('\n--- cell_bank_preparations ---');
  if (prepsErr) {
    console.error('ERROR:', prepsErr.message, '| code:', prepsErr.code);
  } else {
    console.log(`Rows found: ${preps?.length ?? 0}`);
    preps?.forEach(p => console.log(` - [${p.id.slice(0,8)}] ${p.prep_code} (${p.type}) status: ${p.status} vials: ${p.vial_count} created: ${p.created_at}`));
  }

  // 3. Check vials
  const { data: vials, error: vialsErr } = await supabase
    .from('cell_bank_vials')
    .select('id, vial_code, status, preparation_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('\n--- cell_bank_vials (latest 20) ---');
  if (vialsErr) {
    console.error('ERROR:', vialsErr.message, '| code:', vialsErr.code);
  } else {
    console.log(`Rows found (sample): ${vials?.length ?? 0}`);
    vials?.forEach(v => console.log(` - [${v.id.slice(0,8)}] ${v.vial_code} status: ${v.status}`));
  }

  console.log('\n=== DIAGNOSIS SUMMARY ===');
  if (strainsErr?.code === 'PGRST116' || strainsErr?.message?.includes('does not exist')) {
    console.log('❌ TABLE MISSING: cell_bank_strains table does not exist in DB. Migration not applied?');
  } else if (strainsErr?.code === '42501' || strainsErr?.message?.includes('permission')) {
    console.log('❌ RLS POLICY BLOCK: Row Level Security is blocking reads. Check RLS policies.');
  } else if (!strainsErr && strains?.length === 0) {
    console.log('⚠️  NO DATA: Strains table exists but is EMPTY. Data may have never been saved, or was deleted.');
  } else if (!strainsErr && strains?.length > 0) {
    console.log(`✅ DATA EXISTS: ${strains.length} strain(s) found. The data IS in the database.`);
    console.log('   → The issue is likely a DISPLAY/FETCH problem in the UI.');
  }

  if (!prepsErr && preps?.length > 0) {
    console.log(`✅ Preparations: ${preps.length} preparation(s) found in DB.`);
  } else if (!prepsErr && preps?.length === 0) {
    console.log('⚠️  Preparations table is EMPTY.');
  }
}

diagnose().catch(console.error);
