import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Lookup by email to support manually inserted CEO/admin accounts
    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp || emp.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden. Admin only.' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const { action_taken } = body;

    if (!id || !action_taken || !action_taken.trim()) {
      return NextResponse.json({ success: false, error: 'Deviation ID and action_taken are required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ph_readings')
      .update({
        deviation_acknowledged: true,
        acknowledged_by: emp.id,
        acknowledged_at: new Date().toISOString(),
        notes: `Acknowledged: ${action_taken}` // Appended to notes implicitly in logic
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
