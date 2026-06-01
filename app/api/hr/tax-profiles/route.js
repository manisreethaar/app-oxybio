import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp || !['admin', 'hr', 'ceo'].includes(emp.role)) {
      return NextResponse.json({ error: 'Permission Denied' }, { status: 403 });
    }

    const { employee_id, pan_number, uan_number, esi_number, pf_applicable, esi_applicable, pt_applicable, tds_percentage } = await request.json();

    const { data, error } = await supabase.from('hr_tax_profiles').upsert({
      employee_id,
      pan_number,
      uan_number,
      esi_number,
      pf_applicable: pf_applicable ?? true,
      esi_applicable: esi_applicable ?? false,
      pt_applicable: pt_applicable ?? true,
      tds_percentage: tds_percentage ?? 0
    }, { onConflict: 'employee_id' }).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
