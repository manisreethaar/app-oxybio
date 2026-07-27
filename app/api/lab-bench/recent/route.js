import { createClient } from '@/utils/supabase/server';
import { getApiUser } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const user = getApiUser();
    const authError = null;
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const { data, error } = await supabase
      .from('samples')
      .select(`
        id, sample_label, source_label, flask_label, timepoint_label, collected_at, source_type,
        test_results(id, test_type, numeric_value, text_value, unit, skipped, skip_reason, notes, entered_by, entered_at)
      `)
      .eq('collected_by', emp.id)
      .order('collected_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
