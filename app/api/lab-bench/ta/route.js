import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { deductItemFIFO } from '@/lib/inventory/bomUtils';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    const payload = await request.json();
    const { 
      source_type, source_id, source_label, 
      sample_name, sample_description, sampled_at, elapsed_hours,
      acid_type, equivalent_weight, titrant_normality,
      sample_volume_ml, initial_burette_ml, final_burette_ml, notes,
      inventory_item_id // the chemical ID passed for auto-deduction
    } = payload;

    // 1. Insert Titration Log
    const { data: log, error: logErr } = await supabase
      .from('titration_logs')
      .insert({
        source_type, source_id, source_label,
        sample_name, sample_description, sampled_at, elapsed_hours,
        acid_type, equivalent_weight, titrant_normality,
        sample_volume_ml, initial_burette_ml, final_burette_ml, notes,
        logged_by: employee?.id
      })
      .select()
      .single();

    if (logErr) throw logErr;

    // 2. Perform Auto FIFO Deduction if a chemical item was provided
    let deductionLogs = [];
    if (inventory_item_id && final_burette_ml > initial_burette_ml) {
      const volumeUsed = final_burette_ml - initial_burette_ml;
      deductionLogs = await deductItemFIFO(
        supabase, 
        inventory_item_id, 
        volumeUsed, 
        'titration', 
        employee?.id, 
        `Titration TA-${log.id.slice(0,6)}`, 
        { titration_id: log.id, batch_id: source_type === 'batch' ? source_id : null }
      ) || [];
    }

    return NextResponse.json({ success: true, data: log, deductionLogs });
  } catch (error) {
    console.error('Titration Log Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
