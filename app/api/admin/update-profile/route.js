export const dynamic = 'force-dynamic';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';

export async function POST(req) {
  try {
    const supabaseServer = createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const isMaster = isMasterAdmin(user.email);
    const { data: requester } = await supabaseAdmin.from('employees').select('role').eq('id', user.id).single();
    const isAuthorized = isMaster || (['admin', 'ceo', 'cto'].includes(requester?.role));
    if (!isAuthorized) return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 });

    const { employee_id, address, emergency_contact, emergency_contact_name, date_of_birth, joined_date } = await req.json();
    if (!employee_id) return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('employees')
      .update({
        address,
        emergency_contact,
        emergency_contact_name,
        date_of_birth,
        joined_date
      })
      .eq('id', employee_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
