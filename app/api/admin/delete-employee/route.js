import { createClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { isMasterAdmin } from '@/lib/permissions';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    // ── ALOCA++ P0: verify caller identity and role before destroying employee records ──
    const userSupabase = createUserClient();
    const user = await getApiUserOrFallback(userSupabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await userSupabase
      .from('employees')
      .select('role')
      .eq('email', user.email)
      .single();

    if (!caller || (!['admin', 'ceo'].includes(caller.role) && !isMasterAdmin(user.email))) {
      return NextResponse.json({ error: 'Forbidden: Admin or CEO role required to delete an employee' }, { status: 403 });
    }
    // ──────────────────────────────────────────────────────────────────────────────

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    // Need service role key to delete users from auth layer
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 1. Delete from employees table first (if foreign keys don't cascade, this might fail if they have signed SOPs etc)
    // Actually, usually deleting from auth layer cascades to public.employees if set up, or vice versa.
    // Let's delete from auth.users, and if that fails, try to delete from public.employees
    
    // First, try deleting the auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      console.error('Failed to delete auth user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Also explicitly delete from public.employees just in case there's no trigger or cascade configured
    const { error: dbError } = await supabaseAdmin.from('employees').delete().eq('id', id);
    if (dbError) {
      console.error('Failed to delete from employees table:', dbError);
      // It's already deleted from auth, so we return success with a warning, or an error.
      // We'll return the error for visibility
      return NextResponse.json({ error: 'Deleted from auth, but failed to delete employee record: ' + dbError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Employee completely deleted.' });

  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
