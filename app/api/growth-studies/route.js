export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUser } from '@/utils/supabase/get-api-user';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    // Fast path: middleware already validated the JWT and forwarded identity via
    // trusted headers — no need for another supabase.auth.getUser() network call.
    const user = getApiUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const { searchParams } = new URL(req.url);
    const status   = searchParams.get('status');
    const type     = searchParams.get('type');
    const strainId = searchParams.get('strain_id');
    const limit    = searchParams.get('limit');

    let query = supabase
      .from('growth_studies')
      .select(`
        id, study_code, name, study_type, status, vessel_type, temperature_c,
        inoculation_time, expected_duration_hours, completed_at, created_at, created_by,
        creator:employees!growth_studies_created_by_fkey(id, full_name, initials),
        cell_bank_strains(id, name),
        cell_bank_preparations(id, prep_code, type),
        formulations(id, name, code),
        growth_study_time_points(id, status)
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (status)   query = query.eq('status', status);
    if (type)     query = query.eq('study_type', type);
    if (strainId) query = query.eq('cell_bank_strain_id', strainId);
    if (limit)    query = query.limit(parseInt(limit, 10));

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await req.json();
    const { time_points, ...studyData } = body;

    const supabaseAdmin = createAdminClient();

    let study = null;
    let retries = 5;
    let lastErr = null;
    let generatedCode = null;

    // Try using the RPC first in case it works
    const { data: rpcCode, error: rpcErr } = await supabaseAdmin.rpc('generate_gcs_code');
    if (!rpcErr && rpcCode) {
      generatedCode = rpcCode;
    }

    while (retries > 0) {
      if (!generatedCode) {
        // Fallback: manually find max and increment
        const { data: latest } = await supabaseAdmin
          .from('growth_studies')
          .select('study_code')
          .like('study_code', 'OB-GCS-%')
          .order('study_code', { ascending: false })
          .limit(1);
          
        let nextNum = 1;
        const currentYear = new Date().getFullYear().toString().slice(-2);
        
        if (latest && latest.length > 0 && latest[0].study_code) {
          const match = latest[0].study_code.match(new RegExp(`OB-GCS-${currentYear}-(\\d{3})`));
          if (match) {
            nextNum = parseInt(match[1], 10) + 1;
          }
        }
        
        generatedCode = `OB-GCS-${currentYear}-${nextNum.toString().padStart(3, '0')}`;
      }

      const { data, error: studyErr } = await supabaseAdmin
        .from('growth_studies')
        .insert({ ...studyData, created_by: emp.id, study_code: generatedCode })
        .select()
        .single();
        
      if (!studyErr) {
        study = data;
        break;
      }
      
      if (studyErr.code === '23505') { // unique_violation
         generatedCode = null;
         retries--;
         lastErr = studyErr;
         continue;
      } else {
         throw studyErr;
      }
    }
    
    if (!study) {
       throw lastErr || new Error("Failed to generate unique study code");
    }

    if (time_points?.length && study.inoculation_time) {
      const inoc = new Date(study.inoculation_time);
      const tpRows = time_points.map(tp => ({
        study_id: study.id,
        planned_hour: tp.planned_hour,
        sample_types: tp.sample_types,
        scheduled_at: new Date(inoc.getTime() + tp.planned_hour * 3600000).toISOString()
      }));
      const { error: tpErr } = await supabaseAdmin
        .from('growth_study_time_points')
        .insert(tpRows);
      if (tpErr) throw tpErr;
    }

    return NextResponse.json({ data: study }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
