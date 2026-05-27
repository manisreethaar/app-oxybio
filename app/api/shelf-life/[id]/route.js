import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!emp || emp.role !== 'admin') {
      return NextResponse.json({ error: 'Permission denied. Admins only.' }, { status: 403 });
    }

    // Delete logs first to maintain integrity (if no cascade)
    await supabase.from('shelf_life_logs').delete().eq('shelf_life_id', params.id);
    
    // Delete study
    const { error } = await supabase.from('shelf_life_studies').delete().eq('id', params.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
