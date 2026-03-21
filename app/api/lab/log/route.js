import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { batch_id, process_type, parameter_name, parameter_value } = await request.json();

    if (!batch_id || !process_type || !parameter_name || parameter_value === undefined) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }

    // Lookup employee by UUID
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('lab_logs')
      .insert({
        batch_id,
        process_type,
        parameter_name,
        parameter_value: parseFloat(parameter_value),
        logged_by: emp.id
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Lab Log API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
