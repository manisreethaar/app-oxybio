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

    const [batchRes, growthRes] = await Promise.all([
      // Batches currently in fermentation monitoring stage
      supabase
        .from('batches')
        .select(`
          id,
          batch_id,
          status,
          current_stage,
          created_at,
          batch_flasks(id, flask_label)
        `)
        .eq('current_stage', 'fermentation')
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
    ]);

    // Surface pending time points sorted by hour for each study
    const growthStudies = (growthRes.data || []).map(s => ({
      ...s,
      pending_time_points: (s.growth_study_time_points || [])
        .filter(tp => tp.status === 'pending')
        .sort((a, b) => a.planned_hour - b.planned_hour),
    }));

    return NextResponse.json({
      success: true,
      batches:       batchRes.data  || [],
      growth_studies: growthStudies,
    });
  } catch (err) {
    console.error('Lab Bench sources API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
