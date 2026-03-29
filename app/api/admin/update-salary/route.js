import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const supabaseServer = createServerClient();
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: requesterProfile } = await supabaseServer
      .from('employees')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!requesterProfile || !['admin','ceo','cto'].includes(requesterProfile.role)) {
      return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 });
    }

    const { employee_id, base_salary } = await req.json();

    if (!employee_id || base_salary === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { error: dbError } = await supabaseAdmin
      .from('employees')
      .update({ base_salary: parseFloat(base_salary) })
      .eq('id', employee_id);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
