/**
 * GET /api/lab-bench/sources
 *
 * Returns active batches (in fermentation stage) and active growth studies
 * for the Quick Log source dropdowns. Includes flasks and pending time points.
 */

import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [batchRes, growthRes, cellBankRes] = await Promise.all([
      // Only batches that have entered fermentation monitoring.
      // media_prep / sterilisation / inoculation are pre-fermentation — flasks not ready for readings.
      // qc_hold is an explicit hold state — excluded.
      supabase
        .from('batches')
        .select(`
          id,
          batch_id,
          status,
          current_stage,
          created_at,
          batch_flasks(id, flask_label, status, current_stage)
        `)
        .in('current_stage', ['fermentation', 'straining', 'extract_addition'])
        .order('created_at', { ascending: false })
        .limit(30),

      // Active growth studies with pending time points
      supabase
        .from('growth_studies')
        .select(`
          id,
          name,
          study_code,
          status,
          inoculation_time,
          od_wavelength,
          growth_study_time_points(id, planned_hour, status, sample_types)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('cell_bank_preparations')
        .select(`
          id,
          prep_code,
          type,
          status,
          passage_number,
          cell_bank_strains(id, name, accession_number, strain_short_code)
        `)
        .eq('status', 'In Progress')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    // Surface pending time points sorted by hour for each study
    const growthStudies = (growthRes.data || []).map(s => ({
      ...s,
      pending_time_points: (s.growth_study_time_points || [])
        .filter(tp => tp.status === 'pending')
        .sort((a, b) => a.planned_hour - b.planned_hour),
    }));

    // Strip planned / qc_hold flasks from each batch before returning
    const batches = (batchRes.data || []).map(b => ({
      ...b,
      batch_flasks: (b.batch_flasks || []).filter(
        f => f.status !== 'planned' && f.current_stage !== 'qc_hold'
      ),
    }));

    return NextResponse.json({
      success: true,
      batches,
      growth_studies: growthStudies,
      cell_bank_preparations: cellBankRes.data || [],
    });
  } catch (err) {
    console.error('Lab Bench sources API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
