import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Convert a 1-based prep rank to a letter prefix: 1→A, 2→B, ... 26→Z, 27→AA, etc.
function rankToLetter(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

async function run() {
  // Fetch ALL WCB preps ordered by created_at so rank = chronological position
  const { data: preps, error: prepErr } = await supabase
    .from('cell_bank_preparations')
    .select('id, prep_code, type, created_at, cell_bank_strains(strain_short_code)')
    .eq('type', 'WCB')
    .order('created_at', { ascending: true });

  if (prepErr) { console.error('Failed to fetch preps:', prepErr.message); return; }
  if (!preps?.length) { console.log('No WCB preps found.'); return; }

  console.log(`Found ${preps.length} WCB prep(s):\n`);

  const year = '26';

  for (let rank = 1; rank <= preps.length; rank++) {
    const prep = preps[rank - 1];
    const short = (prep.cell_bank_strains?.strain_short_code || 'XX').toUpperCase();
    const letter = rankToLetter(rank);
    const baseCode = `WCB-${year}-${short}-${letter}`;

    console.log(`  [Rank ${rank}] Prep: ${prep.prep_code} → letter="${letter}", new base="${baseCode}"`);

    const { data: vials, error: vialErr } = await supabase
      .from('cell_bank_vials')
      .select('id, vial_code')
      .eq('preparation_id', prep.id)
      .order('vial_code', { ascending: true });

    if (vialErr) { console.error(`  ✗ Failed to fetch vials:`, vialErr.message); continue; }
    console.log(`  → ${vials.length} vials to rename`);

    let failed = 0;
    for (let i = 0; i < vials.length; i++) {
      const newCode = `${baseCode}${String(i + 1).padStart(3, '0')}`;
      const { error: updateErr } = await supabase
        .from('cell_bank_vials')
        .update({ vial_code: newCode })
        .eq('id', vials[i].id);

      if (updateErr) {
        console.error(`    ✗ ${vials[i].vial_code} → ${newCode}: ${updateErr.message}`);
        failed++;
      } else {
        console.log(`    ✓ ${vials[i].vial_code} → ${newCode}`);
      }
    }

    console.log(`  Done (${vials.length - failed}/${vials.length} renamed)\n`);
  }

  console.log('Migration complete.');
}

run().catch(console.error);
