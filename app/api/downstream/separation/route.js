export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function POST(request) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp, error: empError } = await supabase.from('employees').select('id, full_name, role').eq('email', user.email).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    
    // Construct strict ALOCA payload
    const payload = {
      ...body,
      logged_at: new Date().toISOString(),
      logged_by: emp.id,
      logged_by_name: emp.full_name,
      logged_by_role: emp.role,
    };

    // Use admin client to bypass RLS for ALOCA insertion
    const adminSupabase = (await import('@/utils/supabase/admin')).createAdminClient();
    const { error: upsertError } = await adminSupabase
      .from('batch_flask_straining')
      .upsert(payload, { onConflict: 'flask_id' });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DSP Separation API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
