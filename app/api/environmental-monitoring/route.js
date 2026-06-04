import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'samples';

    if (view === 'locations') {
      const { data, error } = await supabase
        .from('emp_sampling_locations')
        .select('*')
        .order('area', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    // view === 'samples'
    const { data, error } = await supabase
      .from('emp_samples')
      .select(`
        *,
        emp_sampling_locations(id, name, area, location_code, sampling_method, alert_limit_cfu, action_limit_cfu),
        sampler:employees!emp_samples_sampled_by_fkey(full_name, initials)
      `)
      .order('sampled_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();

    if (body.type === 'location') {
      const { name, area, location_code, sampling_method, frequency, alert_limit_cfu, action_limit_cfu } = body;
      if (!name || !area || !sampling_method) return NextResponse.json({ error: 'name, area and sampling_method are required' }, { status: 400 });
      const { data, error } = await supabase.from('emp_sampling_locations').insert({
        name, area, location_code: location_code || null,
        sampling_method, frequency: frequency || 'Weekly',
        alert_limit_cfu: alert_limit_cfu ? parseFloat(alert_limit_cfu) : null,
        action_limit_cfu: action_limit_cfu ? parseFloat(action_limit_cfu) : null,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    // type === 'sample'
    const { location_id, sampled_at, incubation_temp_c, incubation_hours, colony_count, organism_identified, result, notes } = body;
    if (!location_id) return NextResponse.json({ error: 'location_id is required' }, { status: 400 });

    // Fetch location limits to auto-determine result
    const { data: loc } = await supabase.from('emp_sampling_locations').select('alert_limit_cfu, action_limit_cfu').eq('id', location_id).single();
    let autoResult = result || 'Pending';
    if (colony_count != null && loc) {
      if (loc.action_limit_cfu && colony_count >= loc.action_limit_cfu) autoResult = 'Action';
      else if (loc.alert_limit_cfu && colony_count >= loc.alert_limit_cfu) autoResult = 'Alert';
      else if (colony_count != null) autoResult = 'Pass';
    }

    const { data, error } = await supabase.from('emp_samples').insert({
      location_id,
      sampled_by: emp.id,
      sampled_at: sampled_at || new Date().toISOString(),
      incubation_temp_c: incubation_temp_c ? parseFloat(incubation_temp_c) : null,
      incubation_hours: incubation_hours ? parseInt(incubation_hours) : 48,
      colony_count: colony_count != null ? parseInt(colony_count) : null,
      organism_identified: organism_identified || null,
      result: autoResult,
      notes: notes || null,
    }).select('*, emp_sampling_locations(name, area, alert_limit_cfu, action_limit_cfu), sampler:employees!emp_samples_sampled_by_fkey(full_name, initials)').single();
    if (error) throw error;

    // Auto-raise CAPA if Action limit breached
    if (autoResult === 'Action') {
      const locName = data.emp_sampling_locations?.name || 'Unknown location';
      await supabase.from('deviations').insert({
        title: `EMP Action Limit Exceeded — ${locName}`,
        severity: 'Major',
        source: 'Environmental Monitoring',
        description: `Colony count of ${colony_count} CFU exceeded Action Limit at ${locName} (${data.emp_sampling_locations?.area}). Immediate investigation and corrective action required.`,
        reported_by: emp.id,
        created_by: emp.id,
        status: 'Open',
      }).then(() => {}).catch(() => {});
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
